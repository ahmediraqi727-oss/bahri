"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useNotifications } from "@/lib/notifications";
import DataTableWrapper from "@/components/DataTableWrapper";
import SupplierContactModal from "@/components/SupplierContactModal";
import { Product, Supplier } from "@/lib/types";
import { exportInventoryToCSV } from "@/lib/csv-export";

interface StockThresholds {
  excellent: number;
  medium: number;
}

const DEFAULT_THRESHOLDS: StockThresholds = { excellent: 75, medium: 40 };
const STORAGE_KEY = "ahmed-bahri-inventory-thresholds";

function loadThresholds(): StockThresholds {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_THRESHOLDS;
}

function saveThresholds(t: StockThresholds) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

function getStockLevel(stock: number, maxStock: number, thresholds: StockThresholds) {
  if (maxStock === 0) return "empty";
  const pct = (stock / maxStock) * 100;
  if (pct >= thresholds.excellent) return "excellent";
  if (pct >= thresholds.medium) return "medium";
  return "low";
}

const LEVEL_STYLES = {
  excellent: { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-300 dark:border-emerald-800", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400", label: "ممتاز", barColor: "#10b981" },
  medium: { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-800", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400", label: "متوسط", barColor: "#f59e0b" },
  low: { bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-300 dark:border-red-800", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400", label: "منخفض", barColor: "#ef4444" },
  empty: { bg: "bg-gray-50 dark:bg-gray-800/50", border: "border-gray-300 dark:border-gray-700", badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400", label: "نفذ", barColor: "#9ca3af" },
};

export default function InventoryPage() {
  const { products, suppliers, updateProduct } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const { addNotification } = useNotifications();

  const [thresholds, setThresholds] = useState<StockThresholds>(DEFAULT_THRESHOLDS);
  const [showSettings, setShowSettings] = useState(false);
  const [contactModal, setContactModal] = useState<{ supplier: Supplier; product: Product } | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const notifiedRef = useRef<Set<string>>(new Set());

  // Bulk Selection & CSV Export State
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  const handleToggleSelectProduct = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedProductIds.size === filtered.length && filtered.length > 0) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleExportInventory = async (scope: "selected" | "filtered" | "all") => {
    setIsExporting(true);
    setExportDropdownOpen(false);
    try {
      let itemsToExport: Product[] = [];
      if (scope === "selected") {
        itemsToExport = products.filter((p) => selectedProductIds.has(p.id));
        if (itemsToExport.length === 0) {
          alert("الرجاء تحديد منتج واحد على الأقل للتصدير");
          setIsExporting(false);
          return;
        }
      } else if (scope === "filtered") {
        itemsToExport = filtered;
      } else {
        itemsToExport = products;
      }

      const today = new Date().toISOString().split("T")[0];
      const scopeLabel = scope === "selected" ? "محددة-" : scope === "filtered" ? `مستوى-${filterLevel}-` : "كامل-المخزون-";
      const filename = `مخزون-متجر-أحمد-بحري-${scopeLabel}${today}.csv`;

      exportInventoryToCSV(itemsToExport, suppliers, thresholds, filename);

      await logActivity({
        user: settings.currentRole,
        action: "export",
        entity: "مخزون",
        details: `تصدير ${itemsToExport.length} منتج من المخزون إلى ملف CSV (${filename})`,
      });
    } catch (err) {
      console.error("Inventory CSV export error:", err);
      alert("حدث خطأ أثناء تصدير المخزون.");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    setThresholds(loadThresholds());
  }, []);

  useEffect(() => {
    saveThresholds(thresholds);
  }, [thresholds]);

  const maxStock = useMemo(() => {
    if (products.length === 0) return 1;
    return Math.max(...products.map((p) => p.stock), 1);
  }, [products]);

  useEffect(() => {
    products.forEach((p) => {
      const level = getStockLevel(p.stock, maxStock, thresholds);
      if ((level === "low" || p.stock === 0) && !notifiedRef.current.has(p.id)) {
        notifiedRef.current.add(p.id);
        addNotification({
          type: p.stock === 0 ? "out_of_stock" : "low_stock",
          title: p.stock === 0 ? "المنتج نفد!" : "كمية منخفضة",
          message: `المنتج "${p.name}" كميته ${p.stock} - يحتاج إعادة تعبئة`,
          productId: p.id,
        });
      }
    });
  }, [products, maxStock, thresholds, addNotification]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filterLevel === "all") return true;
      return getStockLevel(p.stock, maxStock, thresholds) === filterLevel;
    });
  }, [products, filterLevel, maxStock, thresholds]);

  const levelCounts = useMemo(() => {
    const counts = { excellent: 0, medium: 0, low: 0, empty: 0 };
    products.forEach((p) => {
      const level = getStockLevel(p.stock, maxStock, thresholds);
      counts[level as keyof typeof counts]++;
    });
    return counts;
  }, [products, maxStock, thresholds]);

  const getSupplier = (id: string) => suppliers.find((s) => s.id === id);

  const handleInlineStock = async (id: string, value: number) => {
    const product = products.find((p) => p.id === id);
    await updateProduct(id, { stock: value });
    await logActivity({
      user: settings.currentRole,
      action: "update",
      entity: "مخزون",
      entityId: id,
      details: `تعديل كمية "${product?.name}" إلى ${value}`,
    });
  };

  return (
    <div className="space-y-6 w-full max-w-full" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>📦</span>
            <span>إدارة المخزون الذكية</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{products.length} منتج مسجل في المخزون</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* CSV Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              disabled={isExporting}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="تصدير بيانات المخزون كملف CSV"
            >
              <span>📥</span>
              <span>{isExporting ? "جاري التصدير..." : "تصدير المخزون (CSV)"}</span>
              <span className="text-[10px]">▼</span>
            </button>

            {exportDropdownOpen && (
              <div
                className="absolute left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-40 animate-fadeIn"
                dir="rtl"
              >
                <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700/60 mb-1">
                  <p className="text-[11px] font-bold text-gray-400">خيارات تصدير المخزون (CSV/Excel)</p>
                </div>

                {selectedProductIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => handleExportInventory("selected")}
                    className="w-full text-right px-4 py-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span>✓</span>
                      <span>تصدير المنتجات المحددة</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-[10px] font-extrabold">
                      {selectedProductIds.size}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleExportInventory("filtered")}
                  className="w-full text-right px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>🔍</span>
                    <span>تصدير المعروضة حالياً ({filterLevel === "all" ? "الكل" : LEVEL_STYLES[filterLevel as keyof typeof LEVEL_STYLES]?.label || filterLevel})</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-extrabold">
                    {filtered.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportInventory("all")}
                  className="w-full text-right px-4 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between border-t border-gray-100 dark:border-gray-700/60 mt-1 pt-2 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>📊</span>
                    <span>تصدير كامل المخزون (جميع المواد)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-[10px] font-extrabold">
                    {products.length}
                  </span>
                </button>
              </div>
            )}
          </div>

          {settings.currentRole === "manager" && (
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>⚙️</span>
              <span>عتبات التنبيه</span>
            </button>
          )}
        </div>
      </div>

      {/* Level Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["excellent", "medium", "low", "empty"] as const).map((level) => {
          const style = LEVEL_STYLES[level];
          return (
            <button
              key={level}
              onClick={() => setFilterLevel(filterLevel === level ? "all" : level)}
              className={`p-4 rounded-xl border-2 transition-all ${style.bg} ${style.border} ${filterLevel === level ? "ring-2 ring-offset-2 ring-[var(--primary)]" : "hover:shadow-md"}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{levelCounts[level]}</p>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{style.label}</p>
                </div>
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: style.barColor }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Bulk Selection Toolbar */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-900 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm text-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-gray-700 dark:text-gray-300 select-none">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedProductIds.size === filtered.length}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 cursor-pointer"
              />
              <span>تحديد كل المعروض ({filtered.length})</span>
            </label>

            {selectedProductIds.size > 0 && (
              <>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/40">
                  تم تحديد {selectedProductIds.size} من {filtered.length}
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedProductIds(new Set())}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors cursor-pointer"
                >
                  إلغاء التحديد
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedProductIds.size > 0 && (
              <button
                type="button"
                onClick={() => handleExportInventory("selected")}
                disabled={isExporting}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>📥</span>
                <span>تصدير المحددة ({selectedProductIds.size}) CSV</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleExportInventory("filtered")}
              disabled={isExporting}
              className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>📄</span>
              <span>تصدير المعروضة ({filtered.length}) CSV</span>
            </button>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <span className="text-4xl block mb-3">📊</span>
            <p>{filterLevel !== "all" ? "لا توجد منتجات في هذا المستوى" : "لا توجد منتجات في المخزون"}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <DataTableWrapper>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <th className="w-10 px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && selectedProductIds.size === filtered.length}
                          onChange={handleToggleSelectAll}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 cursor-pointer"
                          aria-label="تحديد كل المعروض"
                        />
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المنتج</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">التكاليف</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الجملة</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المفرد</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الكمية</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المستوى</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">القيمة</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المورد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filtered.map((product) => {
                      const level = getStockLevel(product.stock, maxStock, thresholds);
                      const style = LEVEL_STYLES[level];
                      const supplier = getSupplier(product.supplierId);
                      const pct = maxStock > 0 ? Math.round((product.stock / maxStock) * 100) : 0;
                      const isSelected = selectedProductIds.has(product.id);

                      return (
                        <tr
                          key={product.id}
                          className={`${style.bg} border-l-4 ${style.border} ${
                            isSelected ? "ring-2 ring-blue-500/30 bg-blue-50/50 dark:bg-blue-950/40" : ""
                          } transition-colors`}
                        >
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectProduct(product.id)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 cursor-pointer"
                              aria-label={`تحديد ${product.name}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {product.image ? (
                                <img src={product.image} alt="" className="w-9 h-9 rounded-lg object-cover" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center text-gray-400 border border-gray-200 dark:border-gray-700">📦</div>
                              )}
                              <span className="font-medium text-gray-900 dark:text-white">{product.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-white">{product.costPrice.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-900 dark:text-white">{product.wholesalePrice.toLocaleString()}</td>
                          <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{product.retailPrice.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <InlineStock value={product.stock} onSave={(v) => handleInlineStock(product.id, v)} />
                            <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: style.barColor }} />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${style.badge}`}>
                              {style.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                            {(product.retailPrice * product.stock).toLocaleString()} د.ع
                          </td>
                          <td className="px-4 py-3">
                            {supplier && (level === "low" || level === "empty") ? (
                              <button
                                onClick={() => setContactModal({ supplier: supplier!, product })}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
                                style={{ backgroundColor: level === "empty" ? "#ef4444" : "#f59e0b" }}
                              >
                                📨 مراسلة
                              </button>
                            ) : supplier ? (
                              <span className="text-xs text-gray-500 dark:text-gray-400">{supplier.name}</span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTableWrapper>
            </div>

            {/* Mobile Cards List View */}
            <div className="block md:hidden space-y-3.5 p-3">
              {filtered.map((product) => {
                const level = getStockLevel(product.stock, maxStock, thresholds);
                const style = LEVEL_STYLES[level];
                const supplier = getSupplier(product.supplierId);
                const pct = maxStock > 0 ? Math.round((product.stock / maxStock) * 100) : 0;
                const isSelected = selectedProductIds.has(product.id);

                return (
                  <div
                    key={product.id}
                    className={`bg-white dark:bg-gray-900 rounded-2xl border ${style.border} ${
                      isSelected ? "ring-2 ring-blue-500/40 border-blue-500" : ""
                    } p-4 shadow-sm space-y-3 transition-all`}
                  >
                    {/* Header: Checkbox, Title & Status */}
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectProduct(product.id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 cursor-pointer flex-shrink-0"
                          aria-label={`تحديد ${product.name}`}
                        />
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-sm truncate" title={product.name}>
                          {product.name}
                        </h3>
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 ${style.badge}`}>
                        {style.label}
                      </span>
                    </div>

                    {/* Featured Image & Basic Supplier Row */}
                    <div className="flex items-center gap-3.5 bg-gray-50/70 dark:bg-gray-800/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800/60">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center text-gray-400 text-2xl flex-shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm">
                          📦
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 line-clamp-1">{product.name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          المورد: {supplier ? supplier.name : "—"}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-xs font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            {product.retailPrice.toLocaleString()} د.ع
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stock Progress & Edit */}
                    <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-100 dark:border-gray-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">الكمية بالمخزن:</span>
                        <InlineStock value={product.stock} onSave={(v) => handleInlineStock(product.id, v)} />
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: style.barColor }} />
                      </div>
                    </div>

                    {/* Pricing Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-100 dark:border-gray-800/80">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">سعر المفرد</span>
                        <span className="font-black text-blue-600 dark:text-blue-400 text-sm whitespace-nowrap">
                          {product.retailPrice.toLocaleString()} د.ع
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">سعر التكلفة</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {product.costPrice.toLocaleString()} د.ع
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">سعر الجملة</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {product.wholesalePrice.toLocaleString()} د.ع
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">إجمالي القيمة</span>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {(product.retailPrice * product.stock).toLocaleString()} د.ع
                        </span>
                      </div>
                    </div>

                    {/* Footer Action */}
                    {supplier && (level === "low" || level === "empty") && (
                      <button
                        onClick={() => setContactModal({ supplier: supplier!, product })}
                        className="w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl shadow-sm hover:opacity-90 transition-all min-h-[40px] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 shrink-0"
                        style={{ backgroundColor: level === "empty" ? "#ef4444" : "#f59e0b" }}
                      >
                        <span>📨</span>
                        <span className="whitespace-nowrap">مراسلة المورد لتسجيل طلبية تزويد</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Threshold Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">عتبات تنبيه المخزون</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500">✕</button>
            </div>
            <div className="p-5 space-y-5">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      كمية ممتازة (أعلى من)
                    </label>
                    <span className="text-sm font-bold text-emerald-600">{thresholds.excellent}%</span>
                  </div>
                  <input
                    type="range" min={thresholds.medium + 1} max="100" value={thresholds.excellent}
                    onChange={(e) => setThresholds((prev) => ({ ...prev, excellent: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      كمية متوسطة (أعلى من)
                    </label>
                    <span className="text-sm font-bold text-amber-600">{thresholds.medium}%</span>
                  </div>
                  <input
                    type="range" min="1" max={thresholds.excellent - 1} value={thresholds.medium}
                    onChange={(e) => setThresholds((prev) => ({ ...prev, medium: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  كمية منخفضة (أقل من {thresholds.medium}%)
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">معاينة:</p>
                <div className="space-y-2">
                  {[
                    { label: "ممتاز", pct: 85, color: LEVEL_STYLES.excellent.barColor },
                    { label: "متوسط", pct: 50, color: LEVEL_STYLES.medium.barColor },
                    { label: "منخفض", pct: 20, color: LEVEL_STYLES.low.barColor },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-12">{item.label}</span>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
                      </div>
                      <span className="text-xs text-gray-500 w-8">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => setShowSettings(false)} className="w-full py-2.5 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: "var(--primary)" }}>
                حفظ العتبات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Contact Modal */}
      {contactModal && (
        <SupplierContactModal
          supplier={contactModal.supplier}
          productName={contactModal.product.name}
          currentStock={contactModal.product.stock}
          isOpen={true}
          onClose={() => setContactModal(null)}
        />
      )}
    </div>
  );
}

function InlineStock({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value.toString());

  const save = () => {
    const parsed = parseInt(temp);
    if (!isNaN(parsed) && parsed >= 0 && parsed !== value) onSave(parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number" autoFocus min="0" value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="w-20 px-2 py-1 border border-[var(--primary)] rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-bold focus:ring-1 focus:ring-[var(--primary)] outline-none"
      />
    );
  }

  return (
    <span onClick={() => { setTemp(value.toString()); setEditing(true); }} className="cursor-pointer hover:bg-white dark:hover:bg-gray-800 px-2 py-1 rounded font-bold text-gray-900 dark:text-white" title="اضغط لتعديل الكمية">
      {value}
    </span>
  );
}
