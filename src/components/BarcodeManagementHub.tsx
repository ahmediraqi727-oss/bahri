"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useData } from "@/lib/data-context";
import {
  bulkGenerateMissingCodes,
  assignBarcodeToProduct,
  getBarcodeSummary,
  generateEAN13,
  generateQRData,
  batchResetCodes,
  batchToggleBarcodeActive,
} from "@/lib/barcode-service";
import BarcodeDisplay from "@/components/BarcodeDisplay";
import BatchPrintModal from "@/components/BatchPrintModal";
import type { Product } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";
import { useSettings } from "@/lib/settings-context";

export type DateRangePreset = "all" | "today" | "this_week" | "this_month" | "this_year" | "custom";
export type SortOption = "default" | "most_scanned" | "least_scanned" | "newest";

export default function BarcodeManagementHub() {
  const { products, updateProduct, reloadAllData } = useData();
  const { settings, updateSettings } = useSettings();
  const { success, error: toastError, loading: toastLoading, dismiss } = useToast();

  // ─── Master Switch & Staging State (Rollback / Save) ──────────────────────
  const [initialMasterEnabled, setInitialMasterEnabled] = useState<boolean>(
    settings.barcodeEngineActive ?? true
  );
  const [stagedMasterEnabled, setStagedMasterEnabled] = useState<boolean>(
    settings.barcodeEngineActive ?? true
  );
  const [isSavingMaster, setIsSavingMaster] = useState(false);

  // Sync settings when loaded
  useEffect(() => {
    const active = settings.barcodeEngineActive ?? true;
    setInitialMasterEnabled(active);
    setStagedMasterEnabled(active);
  }, [settings.barcodeEngineActive]);

  const hasUnsavedMasterChanges = stagedMasterEnabled !== initialMasterEnabled;

  const handleSaveMaster = async () => {
    setIsSavingMaster(true);
    try {
      await updateSettings({ barcodeEngineActive: stagedMasterEnabled });
      setInitialMasterEnabled(stagedMasterEnabled);
      success(
        stagedMasterEnabled
          ? "✅ تم تفعيل خدمة معالجة والتوليد التلقائي للباركود بنجاح"
          : "⚠️ تم تعطيل خدمة معالجة الباركود"
      );
    } catch (err) {
      toastError("فشل حفظ الإعدادات: " + String(err));
    }
    setIsSavingMaster(false);
  };

  const handleRollbackMaster = () => {
    setStagedMasterEnabled(initialMasterEnabled);
    success("↩ تم التراجع عن التغيرات غير المحفوظة");
  };

  // ─── Filters & Sorting State ──────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "has_code">("all");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("default");

  // ─── Multi-Selection & Batch Modal State ──────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [summary, setSummary] = useState({ total: 0, withBarcode: 0, withQR: 0, missing: 0 });
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });

  // ─── Single Product Edit Modal State ──────────────────────────────────────
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editBarcode, setEditBarcode] = useState("");
  const [editQR, setEditQR] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSummary = useCallback(async () => {
    const s = await getBarcodeSummary();
    setSummary(s);
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary, products]);

  // ─── Date Range Helper ────────────────────────────────────────────────────
  const isWithinDateRange = useCallback((dateStr?: string | null) => {
    if (datePreset === "all") return true;
    if (!dateStr) return false;

    const itemDate = new Date(dateStr);
    const now = new Date();

    if (datePreset === "today") {
      return itemDate.toDateString() === now.toDateString();
    }

    if (datePreset === "this_week") {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return itemDate >= oneWeekAgo;
    }

    if (datePreset === "this_month") {
      return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
    }

    if (datePreset === "this_year") {
      return itemDate.getFullYear() === now.getFullYear();
    }

    if (datePreset === "custom") {
      if (startDate && new Date(startDate) > itemDate) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (end < itemDate) return false;
      }
      return true;
    }

    return true;
  }, [datePreset, startDate, endDate]);

  // ─── Filtered & Sorted Products List ──────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const list = products.filter((p) => {
      // Search
      const matchSearch =
        !search.trim() ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode || "").includes(search) ||
        (p.qrCode || "").includes(search);

      // Status Filter
      const matchFilter =
        filterMode === "all"
          ? true
          : filterMode === "missing"
          ? !p.barcode && !p.qrCode
          : !!(p.barcode || p.qrCode);

      // Date Filter (matches created_at or last_scanned_at)
      const matchDate = isWithinDateRange(p.createdAt || p.lastScannedAt);

      return matchSearch && matchFilter && matchDate;
    });

    // Sorting
    return [...list].sort((a, b) => {
      if (sortOption === "most_scanned") {
        return (b.scanCount || 0) - (a.scanCount || 0);
      }
      if (sortOption === "least_scanned") {
        return (a.scanCount || 0) - (b.scanCount || 0);
      }
      if (sortOption === "newest") {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      return 0; // Default
    });
  }, [products, search, filterMode, sortOption, isWithinDateRange]);

  // ─── Selection Helpers ────────────────────────────────────────────────────
  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedProductsList = useMemo(
    () => products.filter((p) => selectedIds.has(p.id)),
    [products, selectedIds]
  );

  // ─── Batch Actions ────────────────────────────────────────────────────────
  const handleBatchGenerate = async () => {
    if (selectedIds.size === 0) return;
    const targetProducts = selectedProductsList.filter((p) => !p.barcode);
    if (targetProducts.length === 0) {
      toastError("جميع المنتجات المحددة لديها باركود بالفعل.");
      return;
    }

    const confirmed = window.confirm(
      `سيتم توليد باركود تلقائي لـ ${targetProducts.length} منتج محدد. متابعة؟`
    );
    if (!confirmed) return;

    setGenerating(true);
    const toastId = toastLoading("جاري توليد الباركود للمحددة...");
    try {
      let done = 0;
      for (const p of targetProducts) {
        const seq = (Date.now() + done) % 100000;
        const barcode = generateEAN13(seq);
        const qrCode = generateQRData(p.id);
        await updateProduct(p.id, { barcode, qrCode });
        done++;
      }
      await reloadAllData();
      await loadSummary();
      dismiss(toastId);
      success(`✅ تم توليد الباركود لـ ${done} منتج بنجاح!`);
    } catch (err) {
      dismiss(toastId);
      toastError("خطأ أثناء التوليد الجماعي: " + String(err));
    }
    setGenerating(false);
  };

  const handleBatchReset = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      `⚠️ هل أنت متاكد من إزالة وتصفير الأكواد لـ ${selectedIds.size} منتج محدد؟`
    );
    if (!confirmed) return;

    const toastId = toastLoading("جاري إعادة تعيين الأكواد...");
    try {
      await batchResetCodes(Array.from(selectedIds));
      await reloadAllData();
      await loadSummary();
      setSelectedIds(new Set());
      dismiss(toastId);
      success("✅ تم إزالة الأكواد بنجاح.");
    } catch (err) {
      dismiss(toastId);
      toastError(String(err));
    }
  };

  const handleBatchToggleActive = async (active: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      await batchToggleBarcodeActive(Array.from(selectedIds), active);
      await reloadAllData();
      success(active ? "✅ تم تفعيل الأكواد للمحددة" : "⚠️ تم تعطيل الأكواد للمحددة");
    } catch (err) {
      toastError(String(err));
    }
  };

  // ─── Single Bulk Auto-Generate Missing ────────────────────────────────────
  const handleBulkGenerateAll = async () => {
    const confirmed = window.confirm(
      `سيتم توليد باركود تلقائي لـ ${summary.missing} منتج غير مرمّز. هل تريد المتابعة؟`
    );
    if (!confirmed) return;

    setGenerating(true);
    setGenProgress({ done: 0, total: summary.missing });
    const toastId = toastLoading("جاري التوليد التلقائي للبار كود...");

    try {
      const results = await bulkGenerateMissingCodes((done, total) => {
        setGenProgress({ done, total });
      });
      await reloadAllData();
      await loadSummary();
      dismiss(toastId);
      success(`✅ تم توليد ${results.length} باركود بنجاح!`);
    } catch (err) {
      dismiss(toastId);
      toastError("حدث خطأ أثناء التوليد التلقائي: " + String(err));
    }
    setGenerating(false);
    setGenProgress({ done: 0, total: 0 });
  };

  // ─── Single Product Generate/Save ─────────────────────────────────────────
  const handleGenerateSingle = async (product: Product) => {
    if (product.barcode) {
      if (!window.confirm("هذا المنتج لديه باركود بالفعل. هل تريد إعادة التوليد؟")) return;
    }
    try {
      const seq = Date.now() % 100000;
      const barcode = generateEAN13(seq);
      const qrCode = generateQRData(product.id);
      await updateProduct(product.id, { barcode, qrCode });
      await loadSummary();
      success(`✅ تم توليد باركود لـ "${product.name}"`);
    } catch (err) {
      toastError("فشل التوليد: " + String(err));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    setSaving(true);
    try {
      if (editBarcode.trim()) {
        await assignBarcodeToProduct(editingProduct.id, editBarcode.trim(), "barcode");
      }
      if (editQR.trim()) {
        await assignBarcodeToProduct(editingProduct.id, editQR.trim(), "qr_code");
      }
      await reloadAllData();
      await loadSummary();
      success("✅ تم حفظ الكود بنجاح");
      setEditingProduct(null);
    } catch (err) {
      toastError(String(err));
    }
    setSaving(false);
  };

  const pct = (v: number) => (summary.total > 0 ? Math.round((v / summary.total) * 100) : 0);

  return (
    <div className="flex flex-col gap-6" dir="rtl">

      {/* ─── 1. Master Header Switch & Action Toolbar ─────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        
        {/* Master Toggle */}
        <div className="flex items-center gap-4">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={stagedMasterEnabled}
              onChange={(e) => setStagedMasterEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-gray-900 dark:text-white text-base">
                مفتاح الخدمة العام:
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                stagedMasterEnabled
                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300"
              }`}>
                {stagedMasterEnabled ? "⚡ الخدمة مفعّلة" : "⏸ الخدمة معطّلة"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              تفعيل أو إيقاف محرك معالجة الباركود والتوليد التلقائي عبر المنصة
            </p>
          </div>
        </div>

        {/* Action Toolbar with Rollback */}
        <div className="flex items-center gap-2">
          {hasUnsavedMasterChanges && (
            <button
              onClick={handleRollbackMaster}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold transition-all"
            >
              <span>↩</span>
              <span>تراجع (Rollback)</span>
            </button>
          )}

          <button
            onClick={handleSaveMaster}
            disabled={!hasUnsavedMasterChanges || isSavingMaster}
            className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            <span>💾</span>
            <span>{isSavingMaster ? "جاري الحفظ..." : "حفظ الإعدادات"}</span>
          </button>
        </div>
      </div>

      {/* ─── 2. Summary Statistics Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المنتجات", value: summary.total, color: "blue", icon: "📦" },
          { label: "لديها باركود", value: `${summary.withBarcode} (${pct(summary.withBarcode)}%)`, color: "emerald", icon: "✅" },
          { label: "لديها QR", value: `${summary.withQR} (${pct(summary.withQR)}%)`, color: "purple", icon: "📱" },
          { label: "بدون كود", value: `${summary.missing} (${pct(summary.missing)}%)`, color: "red", icon: "❌" },
        ].map(({ label, value, color, icon }) => (
          <div
            key={label}
            className={`bg-${color}-50 dark:bg-${color}-950/30 border border-${color}-200 dark:border-${color}-800 rounded-2xl p-4`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span>{icon}</span>
              <span className={`text-xs font-bold text-${color}-700 dark:text-${color}-300`}>{label}</span>
            </div>
            <div className={`text-xl font-extrabold text-${color}-900 dark:text-${color}-100`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar (during generation) */}
      {generating && genProgress.total > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">جاري التوليد التلقائي...</span>
            <span className="text-sm text-blue-600 dark:text-blue-400">{genProgress.done} / {genProgress.total}</span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all"
              style={{ width: `${(genProgress.done / genProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── 3. Advanced Filtering & Date Range Engine ─────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
        
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Status Filter Tabs */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
            {([
              { key: "all", label: "الكل" },
              { key: "missing", label: "بدون كود" },
              { key: "has_code", label: "مرمّز" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterMode(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterMode === key
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">📅 التاريخ:</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
              className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كافة الأوقات</option>
              <option value="today">اليوم</option>
              <option value="this_week">هذا الأسبوع</option>
              <option value="this_month">هذا الشهر</option>
              <option value="this_year">هذه السنة</option>
              <option value="custom">نطاق مخصص...</option>
            </select>
          </div>

          {/* Sort Option Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">📊 الترتيب:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="default">الترتيب الافتراضي</option>
              <option value="most_scanned">الأكثر مسحاً 🔥</option>
              <option value="least_scanned">الأقل مسحاً ❄</option>
              <option value="newest">الأحدث إضافة ✨</option>
            </select>
          </div>

          {/* Global Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 بحث باسم أو كود الباركود..."
            className="flex-1 min-w-[200px] px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Custom Date Pickers (visible only when datePreset === 'custom') */}
        {datePreset === "custom" && (
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500">من تاريخ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800"
            />
            <span className="text-xs text-gray-500">إلى تاريخ:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="text-xs text-red-500 underline"
              >
                مسح التواريخ
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── 4. Batch Actions Floating Toolbar (When items selected) ───────── */}
      {selectedIds.size > 0 && (
        <div className="bg-gradient-to-l from-blue-900 to-indigo-900 text-white rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center font-extrabold text-xs">
              {selectedIds.size}
            </span>
            <span className="font-extrabold text-sm">منتجات محددة</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Batch Print Button */}
            <button
              onClick={() => setBatchPrintOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <span>🖨</span>
              <span>طباعة الملصقات</span>
            </button>

            {/* Batch Generate Button */}
            <button
              onClick={handleBatchGenerate}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <span>⚡</span>
              <span>توليد باركود</span>
            </button>

            {/* Batch Enable/Disable Toggle */}
            <button
              onClick={() => handleBatchToggleActive(true)}
              className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              تفعيل الأكواد
            </button>

            {/* Batch Reset Button */}
            <button
              onClick={handleBatchReset}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <span>🗑</span>
              <span>تصفير الأكواد</span>
            </button>

            {/* Clear Selection */}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* ─── 5. Main Product Table ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        
        {/* Table top bar */}
        <div className="p-4 bg-gray-50 dark:bg-gray-950 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkGenerateAll}
              disabled={generating || summary.missing === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold rounded-xl text-xs transition-all disabled:opacity-40 shadow-sm"
            >
              <span>⚡</span>
              <span>توليد تلقائي للكل غير المرمّز ({summary.missing})</span>
            </button>
          </div>

          <span className="text-xs text-gray-500 font-bold">
            يعرض {filteredProducts.length} من أصل {products.length} منتج
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-100 dark:bg-gray-950 text-gray-600 dark:text-gray-400 text-xs font-bold uppercase">
              <tr>
                <th className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">المنتج</th>
                <th className="px-4 py-3">الباركود (1D)</th>
                <th className="px-4 py-3">QR Code (2D)</th>
                <th className="px-4 py-3 text-center">مرات المسح 🔥</th>
                <th className="px-4 py-3 text-center">الحالة</th>
                <th className="px-4 py-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredProducts.slice(0, 200).map((product) => {
                const isSelected = selectedIds.has(product.id);
                const hasCode = !!(product.barcode || product.qrCode);

                return (
                  <tr
                    key={product.id}
                    className={`transition-colors ${
                      isSelected
                        ? "bg-blue-50/70 dark:bg-blue-950/30"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectId(product.id)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Product Info */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.image && (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-10 h-10 rounded-xl object-cover border border-gray-200 dark:border-gray-700"
                          />
                        )}
                        <div>
                          <p className="font-extrabold text-gray-900 dark:text-white truncate max-w-[200px]">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">
                            {product.retailPrice.toLocaleString()} د.ع
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Barcode Column */}
                    <td className="px-4 py-3">
                      {product.barcode ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-800 dark:text-gray-200 select-all font-bold">
                            {product.barcode}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(product.barcode!);
                              success("نسخ الكود بنجاح");
                            }}
                            className="text-gray-400 hover:text-blue-500 transition-colors text-xs"
                            title="نسخ"
                          >
                            📋
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>

                    {/* QR Code Column */}
                    <td className="px-4 py-3">
                      {product.qrCode ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-800 dark:text-gray-200 truncate max-w-[120px] select-all">
                            {product.qrCode}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(product.qrCode!);
                              success("نسخ كود QR بنجاح");
                            }}
                            className="text-gray-400 hover:text-blue-500 transition-colors text-xs"
                            title="نسخ"
                          >
                            📋
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>

                    {/* Scan Count Metric */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                        🔥 {product.scanCount || 0}
                      </span>
                    </td>

                    {/* Code Status Badge */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        hasCode
                          ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                      }`}>
                        {hasCode ? "✅ مرمّز" : "❌ بدون كود"}
                      </span>
                    </td>

                    {/* Row Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleGenerateSingle(product)}
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition-all border border-blue-200 dark:border-blue-800"
                          title="توليد باركود"
                        >
                          ⚡ توليد
                        </button>

                        <button
                          onClick={() => {
                            setEditingProduct(product);
                            setEditBarcode(product.barcode || "");
                            setEditQR(product.qrCode || "");
                          }}
                          className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold transition-all border border-gray-200 dark:border-gray-700"
                          title="تعديل يدوي"
                        >
                          ✏ تعديل
                        </button>

                        {(product.barcode || product.qrCode) && (
                          <BarcodeDisplay
                            barcode={product.barcode}
                            qrCode={product.qrCode}
                            productName={product.name}
                            compact
                            showPrint
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                    لا توجد منتجات تطابق شروط التصفية أو البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredProducts.length > 200 && (
          <div className="text-center py-3 text-xs text-gray-400 border-t border-gray-100 dark:border-gray-800">
            يعرض أول 200 نتيجة من أصل {filteredProducts.length}. استخدم البحث لتضييق النتائج.
          </div>
        )}
      </div>

      {/* ─── Batch Print Configuration Modal ─────────────────────────────── */}
      <BatchPrintModal
        isOpen={batchPrintOpen}
        onClose={() => setBatchPrintOpen(false)}
        selectedProducts={selectedProductsList}
      />

      {/* ─── Single Product Manual Edit Modal ─────────────────────────────── */}
      {editingProduct && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingProduct(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-800">
            <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-4">
              ✏ تعديل كود: {editingProduct.name}
            </h3>

            <div className="flex flex-col gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  الباركود (1D)
                </label>
                <input
                  type="text"
                  value={editBarcode}
                  onChange={(e) => setEditBarcode(e.target.value)}
                  placeholder="مثال: 6221234560001"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 font-mono text-center tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  QR Code (2D)
                </label>
                <input
                  type="text"
                  value={editQR}
                  onChange={(e) => setEditQR(e.target.value)}
                  placeholder="مثال: QR-ABC12345-XY789012"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 font-mono text-center tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Live Preview */}
            {(editBarcode || editQR) && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl flex justify-center">
                <BarcodeDisplay
                  barcode={editBarcode || null}
                  qrCode={editQR || null}
                  productName={editingProduct.name}
                  showPrint
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold transition-all hover:bg-gray-200 dark:hover:bg-gray-700 text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-[2] py-3 rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold transition-all disabled:opacity-40 shadow-lg text-xs"
              >
                {saving ? "جاري الحفظ..." : "💾 حفظ الكود"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
