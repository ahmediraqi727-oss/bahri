"use client";

import { useState, useEffect, useRef } from "react";
import { useSettings } from "@/lib/settings-context";
import { useData } from "@/lib/data-context";
import { useToast } from "@/components/ToastProvider";
import { WatermarkConfig, WatermarkPosition, DEFAULT_WATERMARK_CONFIG } from "@/lib/types";
import ImageUploader from "./ImageUploader";

export default function WatermarkSettings() {
  const { settings, updateSettings } = useSettings();
  const { products, categories, reloadAllData } = useData();
  const { success, error: toastError, warning, loading: toastLoading, resolve: resolveToast } = useToast();

  const [config, setConfig] = useState<WatermarkConfig>(
    settings.watermarkConfig || DEFAULT_WATERMARK_CONFIG
  );

  // Sync draft state when settings context changes
  useEffect(() => {
    if (settings.watermarkConfig) {
      setConfig(settings.watermarkConfig);
    }
  }, [settings.watermarkConfig]);

  // Preview Product Image state
  const firstProductWithImage = products.find((p) => p.image && p.image.trim())?.image || "";
  const [sampleImage, setSampleImage] = useState<string>(
    firstProductWithImage || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80"
  );

  // Sharp Server Preview state
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  // Interactive Drag / Click Position Ref
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Bulk Apply options state
  const [bulkScope, setBulkScope] = useState<"all" | "category">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // Check unsaved changes
  const isDirty = JSON.stringify(config) !== JSON.stringify(settings.watermarkConfig || DEFAULT_WATERMARK_CONFIG);

  const handleConfigChange = (updates: Partial<WatermarkConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setServerPreviewUrl(null); // Clear server preview cache when parameters change
  };

  // ── 1. Save Watermark Settings to Supabase DB ─────────────────────────────
  const handleSaveSettings = async () => {
    try {
      await updateSettings({ watermarkConfig: config });
      success("تم حفظ إعدادات العلامة المائية بنجاح!");
    } catch (err: any) {
      toastError("فشل حفظ الإعدادات", err?.message || "حدث خطأ غير متوقع");
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

  // ── 3. Interactive Click & Drag Position Calculation (Percentages) ───────
  const updateCustomPositionFromMouseEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewBoxRef.current) return;
    const rect = previewBoxRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);

    const customX = Math.round((x / rect.width) * 100);
    const customY = Math.round((y / rect.height) * 100);

    handleConfigChange({
      position: "custom",
      customX,
      customY,
    });
  };

  // ── 4. Bulk Processing Execution (Chunked with Progress Bar) ─────────────
  const handleRunBulkWatermark = async (revert: boolean = false) => {
    if (!revert && !config.watermarkUrl) {
      toastError("خطأ", "يرجى رفع شعار العلامة المائية وتحديد الإعدادات أولاً");
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

    const actionText = revert ? "إزالة العلامة المائية والعودة للأصل" : "تطبيق العلامة المائية";
    const confirmMsg = `هل أنت تأكد من إجراء "${actionText}" على ${targetProducts.length} منتج؟`;
    if (!window.confirm(confirmMsg)) return;

    if (revert) setIsReverting(true);
    else setIsProcessingBulk(true);

    const toastId = toastLoading(`جاري ${actionText}...`, `0 / ${targetProducts.length} منتج`);
    setBulkProgress({ current: 0, total: targetProducts.length });

    // Process in Chunks of 15 items per API call to avoid Serverless Timeouts
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
            revertToOriginal: revert,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "فشل أثناء المعالجة الجماعية");
        }

        totalProcessed += data.processedCount || 0;
        totalErrors += data.errorsCount || 0;

        const currentCount = Math.min(i + CHUNK_SIZE, targetProducts.length);
        setBulkProgress({ current: currentCount, total: targetProducts.length });
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
        `🎉 اكملت عملية ${actionText}!`,
        `تمت معالجة ${totalProcessed} منتج بنجاح${totalErrors > 0 ? ` (تخطي ${totalErrors} بسبب أخطاء)` : ""}`
      );
    } catch (err: any) {
      console.error("Bulk process error:", err);
      resolveToast(toastId, "error", "فشلت المعالجة الجماعية", err?.message || "حدث خطأ غير متوقع");
    } finally {
      setIsProcessingBulk(false);
      setIsReverting(false);
      setBulkProgress(null);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 space-y-8 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 dark:border-gray-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-2xl shadow-md">
            💧
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
              أداة العلامة المائية المؤتمتة (Sharp Image Engine)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              دمج الشعار وتطبيق العلامة المائية لحماية صور المنتجات مع الاحتفاظ المستمر بالنسخة الأصلية
            </p>
          </div>
        </div>

        {/* Global Enable Switch */}
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/80 px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700">
          <span className="text-xs font-extrabold text-gray-700 dark:text-gray-200">
            تفعيل العلامة المائية:
          </span>
          <button
            type="button"
            onClick={() => handleConfigChange({ enabled: !config.enabled })}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              config.enabled ? "bg-emerald-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-xs ${
                config.enabled ? "right-0.5" : "right-7"
              }`}
            >
              {config.enabled ? "✅" : "⚪"}
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Settings Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Logo Upload */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>🖼️</span>
              <span>شعار العلامة المائية (Watermark Logo)</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              يدعم مكتبة Sharp صور PNG شفافة عالية الجودة وصيغ Vector SVG لدمج مثالي
            </p>
            <ImageUploader
              label=""
              image={config.watermarkUrl}
              onUpload={(img) => handleConfigChange({ watermarkUrl: img })}
              aspect="aspect-video"
            />
          </div>

          {/* Position Selector */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>📍</span>
                <span>تحديد موقع العلامة المائية</span>
              </h3>
              {config.position === "custom" && (
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  مخصص: X={config.customX}% | Y={config.customY}%
                </span>
              )}
            </div>

            {/* Quick 5 Presets Grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "top-left", label: "↖️ أعلى يسار" },
                { id: "top-right", label: "↗️ أعلى يمين" },
                { id: "center", label: "⏺️ المنتصف" },
                { id: "bottom-left", label: "↙️ أسفل يسار" },
                { id: "bottom-right", label: "↘️ أسفل يمين" },
                { id: "custom", label: "🎯 موقع مخصص (سحب)" },
              ].map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => handleConfigChange({ position: pos.id as WatermarkPosition })}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                    config.position === pos.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]"
                      : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity & Scale Sliders */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-5">
            {/* Opacity Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold text-gray-800 dark:text-gray-200 mb-1.5">
                <span>👁️ الشفافية (Opacity):</span>
                <span className="text-blue-600 dark:text-blue-400 font-extrabold">{config.opacity}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={config.opacity}
                onChange={(e) => handleConfigChange({ opacity: Number(e.target.value) })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Scale Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold text-gray-800 dark:text-gray-200 mb-1.5">
                <span>📐 الحجم بالنسبة لعرْض الصورة (Scale):</span>
                <span className="text-blue-600 dark:text-blue-400 font-extrabold">{config.scale}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={config.scale}
                onChange={(e) => handleConfigChange({ scale: Number(e.target.value) })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                يتم حساب الحجم أوتوماتيكياً بواسطة Sharp بناءً على الأبعاد الأصلية الفعترية لكل صورة (Aspect Ratio Safety)
              </p>
            </div>
          </div>

          {/* Automatic Apply Toggle on New Upload */}
          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-extrabold text-emerald-900 dark:text-emerald-300">
                ⚡ تطبيق العلامة المائية تلقائياً أثناء رفع الصور
              </h4>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                عند رفع صورة جديدة لمنتج أو استيراد ملف Excel، يتم تشغيل السيرفر تلقائياً لدمج العلامة
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.applyOnUpload}
              onChange={(e) => handleConfigChange({ applyOnUpload: e.target.checked })}
              className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
            />
          </div>

          {/* Save Settings Button */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={!isDirty}
              className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <span>💾</span>
              <span>حفظ التغييرات والإعدادات</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Interactive Preview Canvas & Server Test (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-gray-900 rounded-3xl border border-gray-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <span>👁️</span>
                <span>المعاينة التفاعلية الحية</span>
              </h3>
              <span className="text-[11px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                انقر/اسحب لتحديد المكان
              </span>
            </div>

            {/* Change Sample Image Button */}
            <div className="flex items-center justify-between text-xs text-gray-300 bg-gray-800/80 p-2.5 rounded-xl border border-gray-700">
              <span className="truncate max-w-[200px]">صورة الاختبار للعرض</span>
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

            {/* Interactive Preview Canvas Box */}
            <div
              ref={previewBoxRef}
              onClick={updateCustomPositionFromMouseEvent}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onMouseMove={(e) => {
                if (isDragging) updateCustomPositionFromMouseEvent(e);
              }}
              className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden border-2 border-dashed border-gray-700 cursor-crosshair select-none group"
            >
              {/* Product Image Base */}
              <img
                src={serverPreviewUrl || sampleImage}
                alt="Product Sample Preview"
                className="w-full h-full object-contain"
              />

              {/* Client Live Overlay Preview (Only shown if serverPreviewUrl is not active) */}
              {!serverPreviewUrl && config.watermarkUrl && (
                <div
                  className="absolute pointer-events-none transition-all duration-75"
                  style={{
                    width: `${config.scale}%`,
                    opacity: config.opacity / 100,
                    ...(config.position === "top-left"
                      ? { top: "3%", left: "3%" }
                      : config.position === "top-right"
                      ? { top: "3%", right: "3%" }
                      : config.position === "bottom-left"
                      ? { bottom: "3%", left: "3%" }
                      : config.position === "bottom-right"
                      ? { bottom: "3%", right: "3%" }
                      : config.position === "center"
                      ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
                      : {
                          top: `${config.customY}%`,
                          left: `${config.customX}%`,
                          transform: "translate(-50%, -50%)",
                        }),
                  }}
                >
                  <img
                    src={config.watermarkUrl}
                    alt="Watermark Overlay"
                    className="w-full h-auto object-contain drop-shadow-md"
                  />
                </div>
              )}

              {/* Helpful overlay instruction */}
              <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-center text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                💡 يمكنك النقر أو السحب مباشرة على أي مكان في الصورة لتحديد الإحداثيات
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
      </div>

      {/* ── Section: Bulk Application & Revert Options ───────────────────────── */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚀</span>
          <div>
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
              خيارات المعالجة الجماعية (Bulk Processing Operations)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              تطبيق العلامة المائية أو إلغائها على كافة منتجات المتجر الحالية في الخلفية دون حجب واجهة المستخدم
            </p>
          </div>
        </div>

        {/* Progress Bar (if processing) */}
        {bulkProgress && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800 space-y-2 animate-fadeIn">
            <div className="flex justify-between text-xs font-bold text-blue-900 dark:text-blue-300">
              <span>جاري المعالجة في السيرفر (Sharp Chunk Engine)...</span>
              <span>
                {Math.round((bulkProgress.current / bulkProgress.total) * 100)}% ({bulkProgress.current} / {bulkProgress.total})
              </span>
            </div>
            <div className="w-full h-3 bg-blue-200 dark:bg-blue-900/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
                style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="p-5 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
          {/* Scope Selector */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">نطاق التطبيق:</span>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800 dark:text-gray-200">
              <input
                type="radio"
                name="bulkScope"
                checked={bulkScope === "all"}
                onChange={() => setBulkScope("all")}
                className="accent-blue-600"
              />
              <span>تطبيق على جميع المنتجات ({products.length} منتج)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800 dark:text-gray-200">
              <input
                type="radio"
                name="bulkScope"
                checked={bulkScope === "category"}
                onChange={() => setBulkScope("category")}
                className="accent-blue-600"
              />
              <span>تطبيق على قسم محدد</span>
            </label>

            {bulkScope === "category" && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-bold text-gray-800 dark:text-gray-200 outline-none"
              >
                <option value="">— اختر القسم —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleRunBulkWatermark(false)}
              disabled={isProcessingBulk || isReverting || !config.watermarkUrl}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <span>💧</span>
              <span>{isProcessingBulk ? "جاري التطبيق..." : "تطبيق العلامة المائية على الكل"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleRunBulkWatermark(true)}
              disabled={isProcessingBulk || isReverting}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              title="إزالة العلامة المائية المعاملة واسترجاع الصور الأصلية المصنفة في products/original"
            >
              <span>↩️</span>
              <span>{isReverting ? "جاري الاسترجاع..." : "إلغاء العلامة المائية والعودة للأصل"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
