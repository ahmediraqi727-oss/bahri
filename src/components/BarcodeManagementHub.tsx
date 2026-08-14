"use client";

import { useState, useEffect, useCallback } from "react";
import { useData } from "@/lib/data-context";
import {
  bulkGenerateMissingCodes,
  assignBarcodeToProduct,
  getBarcodeSummary,
  generateEAN13,
  generateQRData,
} from "@/lib/barcode-service";
import BarcodeDisplay from "@/components/BarcodeDisplay";
import type { Product } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";

export default function BarcodeManagementHub() {
  const { products, updateProduct, reloadAllData } = useData();
  const { success, error: toastError, loading: toastLoading, dismiss } = useToast();

  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "has_code">("all");
  const [summary, setSummary] = useState({ total: 0, withBarcode: 0, withQR: 0, missing: 0 });
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editBarcode, setEditBarcode] = useState("");
  const [editQR, setEditQR] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSummary = useCallback(async () => {
    const s = await getBarcodeSummary();
    setSummary(s);
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary, products]);

  // ─── Filter ───────────────────────────────────────────────────────────────

  const filtered = products.filter((p) => {
    const matchSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || "").includes(search) ||
      (p.qrCode || "").includes(search);

    const matchFilter =
      filterMode === "all"
        ? true
        : filterMode === "missing"
        ? !p.barcode && !p.qrCode
        : !!(p.barcode || p.qrCode);

    return matchSearch && matchFilter;
  });

  // ─── Bulk Generate ────────────────────────────────────────────────────────

  const handleBulkGenerate = async () => {
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

  // ─── Generate single product code ─────────────────────────────────────────

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

  // ─── Manual Edit Save ─────────────────────────────────────────────────────

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

      {/* Summary Cards */}
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

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleBulkGenerate}
          disabled={generating || summary.missing === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold rounded-2xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          <span>⚡</span>
          <span>توليد تلقائي للكل ({summary.missing} منتج)</span>
        </button>

        {/* Filter Tabs */}
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

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 بحث باسم أو رقم الكود..."
          className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Product Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-400 text-xs font-bold uppercase">
              <tr>
                <th className="px-4 py-3 text-right">المنتج</th>
                <th className="px-4 py-3 text-right">باركود</th>
                <th className="px-4 py-3 text-right">QR Code</th>
                <th className="px-4 py-3 text-center">الحالة</th>
                <th className="px-4 py-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.slice(0, 200).map((product) => {
                const hasCode = !!(product.barcode || product.qrCode);
                return (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.image && (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                          />
                        )}
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white truncate max-w-[180px]">{product.name}</p>
                          <p className="text-xs text-gray-400">{product.retailPrice.toLocaleString()} د.ع</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {product.barcode ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 select-all">{product.barcode}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(product.barcode!)}
                            className="text-gray-400 hover:text-blue-500 transition-colors text-xs"
                            title="نسخ"
                          >📋</button>
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {product.qrCode ? (
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate max-w-[100px] block select-all">{product.qrCode}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        hasCode
                          ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                      }`}>
                        {hasCode ? "✅ مرمّز" : "❌ بدون كود"}
                      </span>
                    </td>
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
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    لا توجد منتجات تطابق البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="text-center py-3 text-xs text-gray-400 border-t border-gray-100 dark:border-gray-800">
            يعرض أول 200 نتيجة من {filtered.length}. استخدم البحث لتضييق النتائج.
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingProduct(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-800">
            <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-4">
              ✏ تعديل كود: {editingProduct.name}
            </h3>

            <div className="flex flex-col gap-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  الباركود (EAN-13 أو أي صيغة)
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
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  QR Code
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

            {/* Preview */}
            {(editBarcode || editQR) && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl flex justify-center">
                <BarcodeDisplay barcode={editBarcode || null} qrCode={editQR || null} productName={editingProduct.name} />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-[2] py-3 rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold transition-all disabled:opacity-40 shadow-lg"
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
