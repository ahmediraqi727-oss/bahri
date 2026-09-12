"use client";

import React, { useState, useRef } from "react";
import { useData, isUUID, productToRow, categoryToRow, supplierToRow, extractCategoryFromNotes } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase-client";
import { StoreBackupPackage, BackupProductItem, CategoryItem, Supplier } from "@/lib/types";

interface PreRestoreSummary {
  version: string;
  exportDate: string;
  storeName: string;
  productsCount: number;
  categoriesCount: number;
  suppliersCount: number;
  rawProducts: any[];
  rawCategories: any[];
  rawSuppliers: any[];
  rawSettings?: any;
}

export default function BackupSettingsSection() {
  const { products, categories, suppliers, exportAllData, reloadAllData } = useData();
  const { settings, updateSettings } = useSettings();
  const { logActivity } = useActivityLog();
  const { success, error: toastError, warning, loading: toastLoading, resolve: resolveToast, update: updateToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastExportTime, setLastExportTime] = useState<string | null>(null);

  // Pre-restore modal state & Progress Indicator
  const [preRestoreData, setPreRestoreData] = useState<PreRestoreSummary | null>(null);
  const [restoreSettingsAlso, setRestoreSettingsAlso] = useState(true);
  const [restoreProgress, setRestoreProgress] = useState<{
    stage: string;
    current: number;
    total: number;
    percentage: number;
  } | null>(null);

  // ─── 1. Export Comprehensive Backup Handler ───────────────────────────────
  const handleExportComprehensiveBackup = async () => {
    try {
      setIsExporting(true);
      const toastId = toastLoading("جارٍ إعداد وتوليد حزمة النسخة الاحتياطية الشاملة...");

      // Fetch fresh raw data from Context/DB
      const rawData = exportAllData();

      const backupPackage: StoreBackupPackage & { siteSettings?: any } = {
        version: "2.0",
        exportDate: new Date().toISOString(),
        storeName: settings.siteName || "موقع أحمد بحري",
        totalProducts: rawData.products.length,
        totalCategories: rawData.categories.length,
        totalSuppliers: rawData.suppliers?.length || 0,
        products: rawData.products,
        categories: rawData.categories,
        suppliers: rawData.suppliers,
        siteSettings: settings,
      };

      const jsonString = JSON.stringify(backupPackage, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      
      const dateFormatted = new Date().toISOString().slice(0, 10);
      downloadAnchor.href = url;
      downloadAnchor.download = `store_full_comprehensive_backup_${dateFormatted}.json`;
      downloadAnchor.click();
      URL.revokeObjectURL(url);

      const nowFormatted = new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
      setLastExportTime(nowFormatted);

      await logActivity({
        user: settings.currentRole,
        action: "export",
        entity: "نسخة احتياطية شاملة",
        details: `تصدير نسخة احتياطية كاملة v2.0 (${rawData.products.length} منتج، ${rawData.categories.length} قسم، ${rawData.suppliers.length} مورد، وإعدادات النظام)`,
      });

      resolveToast(toastId, "success", "🎉 تم تصدير وتحميل ملف النسخة الاحتياطية الشاملة بنجاح!");
    } catch (err: any) {
      console.error("Export backup error:", err);
      toastError(`فشل تصدير النسخة الاحتياطية: ${err?.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── 2. Handle File Select & Pre-Restore Inspection ────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingFile(true);
    const reader = new FileReader();

    reader.onload = async (ev) => {
      try {
        const fileContent = ev.target?.result as string;
        const parsed = JSON.parse(fileContent);

        // Smart reader for v1.0 and v2.0 schemas
        const rawProds = parsed.products || (Array.isArray(parsed) ? parsed : []);
        const rawCats = parsed.categories || [];
        const rawSups = parsed.suppliers || [];
        const rawSetts = parsed.siteSettings || parsed.settings || null;

        if (!Array.isArray(rawProds) || rawProds.length === 0) {
          warning("⚠️ الملف المرفوع لا يحتوي على مصفوفة منتجات صالحة للاستعادة.");
          setIsAnalyzingFile(false);
          return;
        }

        setPreRestoreData({
          version: parsed.version || "1.0 (إصدار سابق)",
          exportDate: parsed.exportDate ? new Date(parsed.exportDate).toLocaleString("ar-IQ") : "غير محدد",
          storeName: parsed.storeName || "غير محدد",
          productsCount: rawProds.length,
          categoriesCount: rawCats.length,
          suppliersCount: rawSups.length,
          rawProducts: rawProds,
          rawCategories: rawCats,
          rawSuppliers: rawSups,
          rawSettings: rawSetts,
        });
      } catch (err: any) {
        console.error("Parse JSON error:", err);
        toastError("❌ خطأ في قراءة صيغة ملف JSON. يرجى التأكد من أن الملف غير تالف.");
      } finally {
        setIsAnalyzingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsText(file);
  };

  // ─── 3. Execute Guaranteed Safe Restore Pipeline ─────────────────────────
  const executeRestorePipeline = async () => {
    if (!preRestoreData) return;

    const toastId = toastLoading("جارٍ استعادة وتنظيم كافة بيانات المتجر بحظر التعارضات...");
    setIsRestoring(true);
    setRestoreProgress({ stage: "جاري استعادة الأقسام والموردين وتأمين المعرفات...", current: 0, total: preRestoreData.productsCount, percentage: 5 });

    try {
      // ── Step A: Foreign Key Safety — Collect Explicit & Implicit Categories ──
      const catMapToUpsert = new Map<string, { name: string; priority: number; is_active: boolean }>();

      if (preRestoreData.rawCategories.length > 0) {
        preRestoreData.rawCategories.forEach((c) => {
          if (c.name && c.name.trim()) {
            catMapToUpsert.set(c.name.trim().toLowerCase(), {
              name: c.name.trim(),
              priority: c.priority || 1,
              is_active: c.isActive !== undefined ? Boolean(c.isActive) : true,
            });
          }
        });
      }

      // Check products for implicit categories (from categoryName, category_name, or notes via extractCategoryFromNotes)
      preRestoreData.rawProducts.forEach((p) => {
        const rawCatName = p.categoryName || p.category_name;
        const notesCatName = extractCategoryFromNotes(p.notes || "");
        const candidateCat = (rawCatName || (notesCatName !== "عام" ? notesCatName : null)) as string | null;
        if (candidateCat && candidateCat.trim()) {
          const key = candidateCat.trim().toLowerCase();
          if (!catMapToUpsert.has(key)) {
            catMapToUpsert.set(key, {
              name: candidateCat.trim(),
              priority: 1,
              is_active: true,
            });
          }
        }
      });

      if (catMapToUpsert.size > 0) {
        const catRows = Array.from(catMapToUpsert.values());
        const { error: catErr } = await supabase.from("categories").upsert(catRows, { onConflict: "name" });
        if (catErr) console.warn("تحذير عند حفظ التصنيفات:", catErr.message);
      }

      if (preRestoreData.rawSuppliers.length > 0) {
        const supRows = preRestoreData.rawSuppliers.map((s) => supplierToRow(s as Record<string, unknown>));
        const { error: supErr } = await supabase.from("suppliers").upsert(supRows, { onConflict: "name" });
        if (supErr) console.warn("تحذير عند حفظ الموردين:", supErr.message);
      }

      // Fetch freshly upserted categories for UUID resolution
      const { data: freshCats } = await supabase.from("categories").select("id, name");
      const categoryNameToIdMap = new Map<string, string>();
      freshCats?.forEach((c) => {
        if (c.name && c.id) categoryNameToIdMap.set(c.name.trim().toLowerCase(), c.id);
      });

      setRestoreProgress({ stage: "جاري تجهيز ورصف حقول المنتجات المالية والمخزنية...", current: 0, total: preRestoreData.productsCount, percentage: 15 });

      // ── Step B: Map Products with Fallbacks & Foreign Key Links ───────────
      const productRowsToUpsert = preRestoreData.rawProducts.map((p) => {
        const costPrice = Number(p.costPrice ?? p.cost_price) || 0;
        const retailPrice = Number(p.price ?? p.retailPrice ?? p.retail_price) || 0;
        const wholesalePrice = Number(p.wholesalePrice ?? p.wholesale_price) || 0;
        const stockVal = Number(p.stockQuantity ?? p.stock_quantity ?? p.stock) || 0;
        const barcodeVal = (p.barcode as string | null) ?? null;
        const qrVal = ((p.qrCodeData ?? p.qrCode ?? p.qr_code) as string | null) ?? null;
        const skuVal = (p.sku as string | null) ?? null;

        // Category ID resolution (UUID -> explicit name -> extracted from notes)
        let catId = p.categoryId && isUUID(p.categoryId) ? p.categoryId : null;
        if (!catId) {
          const rawCatName = p.categoryName || p.category_name;
          const notesCatName = extractCategoryFromNotes(p.notes || "");
          const candidateCat = rawCatName || (notesCatName !== "عام" ? notesCatName : "");
          if (candidateCat) {
            const catNameClean = String(candidateCat).trim().toLowerCase();
            catId = categoryNameToIdMap.get(catNameClean) || null;
          }
        }

        const row = productToRow({
          ...p,
          costPrice,
          retailPrice,
          wholesalePrice,
          stock: stockVal,
          barcode: barcodeVal,
          qrCode: qrVal,
          sku: skuVal,
          categoryId: catId,
        } as Record<string, unknown>);

        return row;
      });

      // ── Step C: Chunked Upsert Products into Supabase with Live Progress Indicator ──
      const CHUNK_SIZE = 50;
      const totalCount = productRowsToUpsert.length;
      const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);

      for (let i = 0; i < totalCount; i += CHUNK_SIZE) {
        const chunk = productRowsToUpsert.slice(i, i + CHUNK_SIZE);
        const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
        const processedCount = Math.min(i + CHUNK_SIZE, totalCount);
        const percent = Math.round(15 + (processedCount / totalCount) * 80);

        const stageText = `جاري استعادة الدفعة ${chunkIndex} من ${totalChunks} (${processedCount}/${totalCount} منتج)...`;
        setRestoreProgress({
          stage: stageText,
          current: processedCount,
          total: totalCount,
          percentage: percent,
        });

        updateToast(toastId, { title: `🔄 ${stageText} (${percent}%)` });

        const { error: prodErr } = await supabase.from("products").upsert(chunk, { onConflict: "name" });
        if (prodErr) {
          throw new Error(`فشل إدخال دفعة المنتجات: ${prodErr.message}`);
        }
      }

      // ── Step D: Restore Site Settings if selected and present ─────────────
      if (restoreSettingsAlso && preRestoreData.rawSettings) {
        try {
          await updateSettings(preRestoreData.rawSettings);
        } catch (sErr) {
          console.warn("تعذر تحديث إعدادات الهوية:", sErr);
        }
      }

      // ── Step E: Final Synchronization ──────────────────────────────────────
      setRestoreProgress({ stage: "جاري مزامنة قاعدة البيانات والواجهة...", current: totalCount, total: totalCount, percentage: 100 });
      await reloadAllData();

      await logActivity({
        user: settings.currentRole,
        action: "import",
        entity: "استعادة كاملة للنظام",
        details: `تمت استعادة متجر كاملة بنجاح (${preRestoreData.productsCount} منتج، ${preRestoreData.categoriesCount} قسم، ${preRestoreData.suppliersCount} مورد)`,
      });

      resolveToast(
        toastId,
        "success",
        `🎉 اكتملت الاستعادة بنجاح!\n• المنتجات: ${preRestoreData.productsCount}\n• الأقسام: ${preRestoreData.categoriesCount}\n• الموردين: ${preRestoreData.suppliersCount}`
      );
      setPreRestoreData(null);
      setRestoreProgress(null);
    } catch (err: any) {
      console.error("Restore pipeline failure:", err);
      toastError(`❌ فشل أثناء تطبيق عملية الاستعادة: ${err?.message || err}`);
      setRestoreProgress(null);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 space-y-8 shadow-sm transition-all duration-300" dir="rtl">
      
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-2xl text-white shadow-lg shadow-blue-500/20 flex-shrink-0">
            🛡️
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              النسخ الاحتياطي والاستعادة الشاملة
              <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
                v2.0 الشامل
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              تصدير كافة بيانات المتجر من منتجات بالأسعار والمخزون والباركود وأكواد QR والأقسام، أو استعادتها بأمان تام.
            </p>
          </div>
        </div>

        <button
          onClick={() => reloadAllData()}
          className="self-start sm:self-auto px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors flex items-center gap-2"
        >
          <span>🔄</span>
          <span>تحديث مزامنة البيانات</span>
        </button>
      </div>

      {/* Database Overview Quick Badge */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mb-1">📦 إجمالي المنتجات</p>
          <p className="text-2xl font-black text-blue-900 dark:text-blue-100">{products.length.toLocaleString()}</p>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
          <p className="text-xs text-purple-600 dark:text-purple-400 font-bold mb-1">📂 إجمالي الأقسام</p>
          <p className="text-2xl font-black text-purple-900 dark:text-purple-100">{categories.length.toLocaleString()}</p>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mb-1">🚚 إجمالي الموردين</p>
          <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100">{suppliers.length.toLocaleString()}</p>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mb-1">🕒 آخر تصدير محلي</p>
          <p className="text-xs font-black text-amber-900 dark:text-amber-100 truncate mt-2">
            {lastExportTime || "لم يتم التصدير اليوم"}
          </p>
        </div>
      </div>

      {/* Main Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Card 1: Comprehensive Export */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/50 dark:from-gray-800/80 dark:via-gray-900 dark:to-blue-950/30 border border-blue-200/80 dark:border-blue-800/40 shadow-sm flex flex-col justify-between space-y-6 relative overflow-hidden group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-md">
                📤
              </span>
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-extrabold rounded-xl border border-blue-200 dark:border-blue-700">
                حفظ شامل (JSON)
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">تصدير نسخة احتياطية كاملة للمتجر</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                إنشاء وتنزيل حزمة متكاملة تضم المنتجات (الأسعار الأساسية والتكلفة، كميات المخزون، الباركود، رموز QR، الـ SKU)، الأقسام والموردين وإعدادات الهوية.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-gray-200/60 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>تصدير {products.length} منتج شامل الأسعار والأكواد والرموز.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>حفظ {categories.length} قسم مع الأولويات والصور.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>تضمين ملفات إعدادات الهوية والتصميم الخاصة بالمتجر.</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleExportComprehensiveBackup}
            disabled={isExporting}
            className="w-full py-3.5 px-6 rounded-2xl font-extrabold text-xs sm:text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            {isExporting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>جارٍ التوليد والتصدير...</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>تصدير وتنزيل النسخة الاحتياطية (JSON)</span>
              </>
            )}
          </button>
        </div>

        {/* Card 2: Comprehensive Restore */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 dark:from-gray-800/80 dark:via-gray-900 dark:to-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 shadow-sm flex flex-col justify-between space-y-6 relative overflow-hidden group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-md">
                📥
              </span>
              <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold rounded-xl border border-emerald-200 dark:border-emerald-700">
                استعادة ودعم v1.0 & v2.0
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">استعادة بيانات المتجر من ملف</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                استعادة كافة البيانات المحفوظة بأمان تام. يقوم المحرك الذكي برفع التصنيفات والموردين أولاً لتأمين المفتاح الأجنبي ثم دمج المنتجات والأسعار بدون خطأ.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-gray-200/60 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>حماية صرامة المفتاح الأجنبي (Foreign Key Safety Guaranteed).</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>معاينة وتأكيد البيانات المرفوعة قبل البدء بحفظها.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>تحديث محلي وفوري لقاعدة بيانات Supabase المباشرة.</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzingFile || isRestoring}
            className="w-full py-3.5 px-6 rounded-2xl font-extrabold text-xs sm:text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            {isAnalyzingFile ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>جارٍ فحص الملف المرفوع...</span>
              </>
            ) : (
              <>
                <span>📂</span>
                <span>اختر ملف نسخة احتياطية (.json) لرفعها</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Pre-Restore Confirmation Modal */}
      {preRestoreData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-xl w-full p-6 sm:p-8 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-6 text-right relative overflow-hidden">
            
            {/* Header Bar */}
            <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-emerald-500 to-teal-600" />

            <div className="flex items-center gap-3 pt-2">
              <span className="text-3xl p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                📋
              </span>
              <div>
                <h3 className="font-extrabold text-lg sm:text-xl text-gray-900 dark:text-white">
                  معاينة وتأكيد استعادة النسخة الاحتياطية
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  تم تحليل ملف الـ JSON المرفوع بنجاح. يرجى مراجعة تفاصيل النسخة قبل البدء.
                </p>
              </div>
            </div>

            {/* Summary Details Box */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="text-gray-500 dark:text-gray-400">إصدار الهيكل:</span>
                <span className="font-extrabold text-blue-600 dark:text-blue-400">{preRestoreData.version}</span>
              </div>

              <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="text-gray-500 dark:text-gray-400">تاريخ التصدير الأصلي:</span>
                <span className="font-bold text-gray-900 dark:text-white">{preRestoreData.exportDate}</span>
              </div>

              <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="text-gray-500 dark:text-gray-400">عدد المنتجات الواردة:</span>
                <span className="font-extrabold text-purple-600 dark:text-purple-400">{preRestoreData.productsCount} منتج</span>
              </div>

              <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="text-gray-500 dark:text-gray-400">عدد التصنيفات:</span>
                <span className="font-bold text-gray-900 dark:text-white">{preRestoreData.categoriesCount} قسم</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">عدد الموردين:</span>
                <span className="font-bold text-gray-900 dark:text-white">{preRestoreData.suppliersCount} مورد</span>
              </div>
            </div>

            {/* Options Checkbox */}
            {preRestoreData.rawSettings && (
              <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreSettingsAlso}
                  disabled={isRestoring}
                  onChange={(e) => setRestoreSettingsAlso(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>استعادة إعدادات وتصاميم المتجر المرفقة مع النسخة أيضاً</span>
              </label>
            )}

            {/* Live Progress Bar Indicator */}
            {isRestoring && restoreProgress && (
              <div className="space-y-2 bg-emerald-50 dark:bg-emerald-950/50 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 animate-pulse">
                <div className="flex justify-between items-center text-xs font-extrabold text-emerald-900 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    {restoreProgress.stage}
                  </span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-700">
                    {restoreProgress.percentage}%
                  </span>
                </div>
                <div className="w-full bg-emerald-200 dark:bg-emerald-900/60 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${restoreProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={executeRestorePipeline}
                disabled={isRestoring}
                className="flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isRestoring ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جارٍ تطبيق الاستعادة الشاملة ({restoreProgress?.percentage || 0}%)...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>بدء الاستعادة الشاملة الآن</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setPreRestoreData(null)}
                disabled={isRestoring}
                className="py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>

          </div>
        </div>
      )}

    </section>
  );
}
