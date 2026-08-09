"use client";

/**
 * ==========================================
 * DateFilterPanel.tsx
 * Advanced Date-Based Product Filtering & Bulk Management
 * أحمد بحري Dashboard — Enterprise Grade
 * ==========================================
 */

import React, { useState, useMemo, useCallback } from "react";
import { Product } from "@/lib/types";
import { DateFilter, DatePreset, filterProductsByDate, resolveDateRange } from "@/lib/import-validator";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DateFilterPanelProps {
  products: Product[];
  categories: { id: string; name: string }[];
  onSelectionChange: (ids: string[]) => void;
  onBulkAction: (action: "category" | "delete", ids: string[], payload?: { category: string }) => Promise<void>;
}

// ─── Date Preset Labels ───────────────────────────────────────────────────────

const PRESETS: { key: DatePreset; label: string; icon: string }[] = [
  { key: "today",     label: "اليوم",          icon: "📅" },
  { key: "yesterday", label: "أمس",             icon: "◀️" },
  { key: "last7",     label: "آخر 7 أيام",      icon: "📆" },
  { key: "last30",    label: "آخر 30 يوم",      icon: "🗓️" },
  { key: "thisMonth", label: "هذا الشهر",        icon: "📇" },
  { key: "custom",    label: "تاريخ مخصص",       icon: "🎛️" },
];

// ─── Utility: group products by date ─────────────────────────────────────────

function groupByDate(products: Product[]): Map<string, Product[]> {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.createdAt ? p.createdAt.slice(0, 10) : "غير معروف";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  // Sort descending
  return new Map([...map.entries()].sort(([a], [b]) => b.localeCompare(a)));
}

function formatDateArabic(dateStr: string): string {
  if (dateStr === "غير معروف") return dateStr;
  try {
    return new Date(dateStr).toLocaleDateString("ar-IQ", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ─── Summary badge ────────────────────────────────────────────────────────────

function SummaryBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl ${color} min-w-[80px]`}>
      <span className="text-lg font-extrabold leading-none">{value}</span>
      <span className="text-[10px] font-medium opacity-80 mt-0.5 text-center">{label}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DateFilterPanel({
  products,
  categories,
  onSelectionChange,
  onBulkAction,
}: DateFilterPanelProps) {
  // Filter state
  const [filter, setFilter] = useState<DateFilter | null>(null);
  const [activePreset, setActivePreset] = useState<DatePreset | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Sort
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Panel collapse
  const [collapsed, setCollapsed] = useState(false);

  // ── Filtered products ──────────────────────────────────────────────────────
  const filteredProducts = useMemo(
    () =>
      filterProductsByDate(products, filter).sort((a, b) => {
        const da = a.createdAt || "";
        const db = b.createdAt || "";
        return sortDir === "desc" ? db.localeCompare(da) : da.localeCompare(db);
      }),
    [products, filter, sortDir]
  );

  const grouped = useMemo(() => groupByDate(filteredProducts), [filteredProducts]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalStock = filteredProducts.reduce((s, p) => s + p.stock, 0);
    const totalValue = filteredProducts.reduce((s, p) => s + p.retailPrice * p.stock, 0);
    return { count: filteredProducts.length, totalStock, totalValue };
  }, [filteredProducts]);

  // ── Preset handler ─────────────────────────────────────────────────────────
  const applyPreset = useCallback(
    (preset: DatePreset) => {
      setActivePreset(preset);
      if (preset === "custom") {
        if (customFrom && customTo) {
          setFilter({ preset: "custom", from: customFrom, to: customTo });
        }
      } else {
        setFilter({ preset });
      }
      setSelectedIds([]);
      onSelectionChange([]);
    },
    [customFrom, customTo, onSelectionChange]
  );

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    setFilter({ preset: "custom", from: customFrom, to: customTo });
    setActivePreset("custom");
    setSelectedIds([]);
    onSelectionChange([]);
  };

  const clearFilter = () => {
    setFilter(null);
    setActivePreset(null);
    setSelectedIds([]);
    onSelectionChange([]);
  };

  // ── Selection handlers ─────────────────────────────────────────────────────
  const isAllSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    const next = isAllSelected ? [] : filteredProducts.map((p) => p.id);
    setSelectedIds(next);
    onSelectionChange(next);
  };

  const toggleSelectOne = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    onSelectionChange(next);
  };

  const selectByDate = (date: string) => {
    const dateProducts = grouped.get(date) || [];
    const dateIds = dateProducts.map((p) => p.id);
    const allSelected = dateIds.every((id) => selectedIds.includes(id));
    const next = allSelected
      ? selectedIds.filter((id) => !dateIds.includes(id))
      : [...new Set([...selectedIds, ...dateIds])];
    setSelectedIds(next);
    onSelectionChange(next);
  };

  // ── Date range label ───────────────────────────────────────────────────────
  const activeDateRangeLabel = useMemo(() => {
    if (!filter) return null;
    const { from, to } = resolveDateRange(filter);
    if (from === to) return formatDateArabic(from);
    return `${formatDateArabic(from)} — ${formatDateArabic(to)}`;
  }, [filter]);

  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 cursor-pointer select-none"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🗓️</span>
          <div>
            <h3 className="text-white font-extrabold text-sm leading-none">
              الفرز والتحكم حسب تاريخ الإضافة
            </h3>
            {activeDateRangeLabel && (
              <p className="text-indigo-200 text-[11px] mt-0.5">{activeDateRangeLabel}</p>
            )}
          </div>
          {filter && (
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
              {filteredProducts.length} منتج
            </span>
          )}
        </div>
        <span className={`text-white transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}>
          ▼
        </span>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* ── Preset Buttons ───────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold
                  transition-all border
                  ${
                    activePreset === p.key
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.03]"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                  }
                `}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}

            {/* Sort toggle */}
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-indigo-400 transition-all"
              title="تغيير ترتيب الفرز"
            >
              {sortDir === "desc" ? "🔽 الأحدث أولاً" : "🔼 الأقدم أولاً"}
            </button>

            {filter && (
              <button
                onClick={clearFilter}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 transition-all"
              >
                ✕ إلغاء الفلتر
              </button>
            )}
          </div>

          {/* ── Custom Date Range ────────────────────────────────────────── */}
          {activePreset === "custom" && (
            <div className="flex flex-wrap items-end gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-700">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">من تاريخ</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">إلى تاريخ</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <button
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50 transition-all"
              >
                تطبيق
              </button>
            </div>
          )}

          {/* ── Stats Row ────────────────────────────────────────────────── */}
          {filter && (
            <div className="flex flex-wrap gap-2">
              <SummaryBadge
                label="منتج مفلتر"
                value={stats.count}
                color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
              />
              <SummaryBadge
                label="محدد"
                value={selectedIds.length}
                color="bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
              />
              <SummaryBadge
                label="إجمالي المخزون"
                value={stats.totalStock.toLocaleString("ar")}
                color="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              />
              <SummaryBadge
                label="قيمة المخزون"
                value={`${stats.totalValue.toLocaleString("ar")} د.ع`}
                color="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
              />
            </div>
          )}



          {/* ── Products grouped by date ──────────────────────────────────── */}
          {filter && (
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
              {/* Select All row */}
              {filteredProducts.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    id="select-all-date"
                    className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                  />
                  <label htmlFor="select-all-date" className="text-xs font-bold text-gray-700 dark:text-gray-200 cursor-pointer">
                    تحديد الكل ({filteredProducts.length} منتج)
                  </label>
                </div>
              )}

              {filteredProducts.length === 0 ? (
                <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-sm font-medium">لا توجد منتجات في هذه الفترة الزمنية</p>
                </div>
              ) : (
                Array.from(grouped.entries()).map(([date, dateProducts]) => {
                  const dateIds = dateProducts.map((p) => p.id);
                  const allDateSelected = dateIds.every((id) => selectedIds.includes(id));
                  const someSelected = dateIds.some((id) => selectedIds.includes(id));

                  return (
                    <div key={date} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                      {/* Date header */}
                      <div
                        className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-750 cursor-pointer hover:from-indigo-50 dark:hover:from-indigo-900/30 transition-colors"
                        onClick={() => selectByDate(date)}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              allDateSelected
                                ? "bg-indigo-600 border-indigo-600"
                                : someSelected
                                ? "bg-indigo-200 border-indigo-400"
                                : "border-gray-400 dark:border-gray-500"
                            }`}
                          >
                            {(allDateSelected || someSelected) && (
                              <span className="text-white text-[9px] font-black leading-none">
                                {allDateSelected ? "✓" : "−"}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-100">
                            📅 {formatDateArabic(date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {dateIds.filter((id) => selectedIds.includes(id)).length}/{dateProducts.length} محدد
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                            {dateProducts.length} منتج
                          </span>
                        </div>
                      </div>

                      {/* Products list */}
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {dateProducts.map((product) => {
                          const isSelected = selectedIds.includes(product.id);
                          return (
                            <div
                              key={product.id}
                              onClick={() => toggleSelectOne(product.id)}
                              className={`
                                flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors text-sm
                                ${
                                  isSelected
                                    ? "bg-indigo-50 dark:bg-indigo-900/20"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                }
                              `}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 accent-indigo-600 shrink-0 rounded cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              />

                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.name}
                                  className="w-8 h-8 rounded-lg object-cover shrink-0 border border-gray-200 dark:border-gray-700"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 flex items-center justify-center text-sm shrink-0">
                                  📦
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <p className={`font-semibold truncate text-xs leading-snug ${isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-gray-100"}`}>
                                  {product.name}
                                </p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                  {product.notes?.split("|")[0]?.trim() || "—"}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 text-right">
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  {product.retailPrice.toLocaleString("ar")} د.ع
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${product.stock > 0 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
                                  {product.stock > 0 ? `${product.stock}` : "نفد"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── No filter selected empty state ───────────────────────────── */}
          {!filter && (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <div className="text-4xl mb-2">🗓️</div>
              <p className="text-sm font-medium">اختر فترة زمنية للبدء بالفلترة</p>
              <p className="text-[11px] mt-1 opacity-70">يمكنك بعدها تحديد المنتجات وتطبيق عمليات جماعية عليها</p>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
