"use client";

/**
 * ==========================================
 * Smart Trash Dashboard (سلة المهملات الذكية)
 * أحمد بحري Dashboard — Enterprise Grade
 * ==========================================
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useTrash, TrashItem } from "@/lib/trash";
import { useData } from "@/lib/data-context";
import { useActivityLog, formatTimestamp } from "@/lib/activity-log";
import { useToast } from "@/components/ToastProvider";
import DataTableWrapper from "@/components/DataTableWrapper";
import { DatePreset, resolveDateRange } from "@/lib/import-validator";

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const ENTITY_ICONS: Record<string, string> = {
  product: "📦",
  supplier: "🚚",
  order: "🛒",
  customer: "👤",
  category: "📁",
  default: "📄",
};

const ENTITY_NAMES_AR: Record<string, string> = {
  product: "منتج",
  supplier: "مورد",
  order: "طلب",
  customer: "زبون",
  category: "قسم",
};

const PRESETS: { key: DatePreset | "all"; label: string; icon: string }[] = [
  { key: "all",       label: "كافة الأوقات", icon: "🌐" },
  { key: "today",     label: "اليوم",        icon: "📅" },
  { key: "yesterday", label: "أمس",           icon: "◀️" },
  { key: "last7",     label: "آخر 7 أيام",    icon: "📆" },
  { key: "last30",    label: "آخر 30 يوماً",  icon: "🗓️" },
  { key: "custom",    label: "تاريخ مخصص",   icon: "🎛️" },
];

// ─── Sub-component: Header Checkbox with Indeterminate state ──────────────────

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  title,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={onChange}
      title={title}
      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer transition-transform active:scale-95 shrink-0"
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrashPage() {
  const {
    items,
    restore,
    bulkRestore,
    permanentDelete,
    bulkPermanentDelete,
    purgeExpired,
    autoDeleteDays,
    setAutoDeleteDays,
    reloadTrash,
  } = useTrash();
  const { reloadAllData } = useData();
  const { logActivity } = useActivityLog();
  const { success: toastSuccess, error: toastError, warning: toastWarning, loading: toastLoading, resolve: resolveToast } = useToast();

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset | "all">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Selection & Modal States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<"single" | "bulk" | null>(null);
  const [targetSingleItem, setTargetSingleItem] = useState<TrashItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Auto-delete settings edit state
  const [tempDays, setTempDays] = useState<number>(autoDeleteDays);

  useEffect(() => {
    setTempDays(autoDeleteDays);
  }, [autoDeleteDays]);

  // Extract all entity types present in current trash items
  const entities = useMemo(() => {
    const set = new Set(items.map((i) => i.entity));
    return Array.from(set);
  }, [items]);

  // ─── Date Range Resolution ─────────────────────────────────────────────────
  const activeDateRange = useMemo(() => {
    if (datePreset === "all") return null;
    if (datePreset === "custom") {
      if (customFrom && customTo) return { from: customFrom, to: customTo };
      return null;
    }
    return resolveDateRange({ preset: datePreset });
  }, [datePreset, customFrom, customTo]);

  // ─── Filtered Items List ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return items.filter((item) => {
      // Entity type filter
      if (entityFilter !== "all" && item.entity !== entityFilter) return false;

      // Date range filter
      if (activeDateRange) {
        const itemDate = item.deletedAt ? item.deletedAt.slice(0, 10) : "";
        if (itemDate < activeDateRange.from || itemDate > activeDateRange.to) return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.entityName.toLowerCase().includes(q) ||
          item.entity.toLowerCase().includes(q) ||
          item.deletedBy.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [items, entityFilter, activeDateRange, searchQuery]);

  // ─── Checkbox Selection Logic ─────────────────────────────────────────────
  const isAllSelected = filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id));
  const isPartialSelected = !isAllSelected && selectedIds.some((id) => filtered.some((i) => i.id === id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((i) => i.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Quick selection helper: select items deleted today / last 7 days
  const selectByPresetDate = (preset: DatePreset) => {
    const range = resolveDateRange({ preset });
    const matchingIds = items
      .filter((i) => {
        const dateStr = i.deletedAt ? i.deletedAt.slice(0, 10) : "";
        return dateStr >= range.from && dateStr <= range.to;
      })
      .map((i) => i.id);

    if (matchingIds.length === 0) {
      toastWarning("لا توجد عناصر محذوفة في هذه الفترة الزمنية");
      return;
    }

    setSelectedIds(matchingIds);
    toastSuccess(`تم تحديد ${matchingIds.length} عنصر محذوف`);
  };

  // ─── Restoration Handlers ─────────────────────────────────────────────────
  const handleRestoreSingle = async (item: TrashItem) => {
    const toastId = toastLoading("جاري الاستعادة...", `استعادة "${item.entityName}" إلى قاعدة البيانات`);
    try {
      const restored = await restore(item.id);
      if (restored) {
        await Promise.all([reloadAllData(), reloadTrash()]);
        await logActivity({
          user: "manager",
          action: "restore",
          entity: restored.entity,
          entityId: restored.entityId,
          details: `استعادة "${restored.entityName}" من سلة المهملات إلى قاعدة البيانات`,
        });
        resolveToast(toastId, "success", `✅ تمت استعادة "${item.entityName}" بنجاح!`);
      }
    } catch (err: any) {
      resolveToast(toastId, "error", "فشلت الاستعادة", err?.message || "حدث خطأ أثناء الاتصال بقاعدة البيانات");
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.length === 0) return;
    setIsProcessing(true);
    const total = selectedIds.length;
    const toastId = toastLoading("جاري بدء عملية الاستعادة...", `جاري معالجة ${total} عنصر...`);
    try {
      const restored = await bulkRestore(selectedIds, (processed, totalCount) => {
        toastLoading(`جاري استعادة ${processed} من ${totalCount}... (دفعات 50 عنصر/طلب)`, "إعادة البناء إلى الجداول الأصلية", toastId);
      });
      await Promise.all([reloadAllData(), reloadTrash()]);
      await logActivity({
        user: "manager",
        action: "restore",
        entity: "سلة المهملات",
        details: `استعادة جماعية لـ ${restored.length} عنصر من سلة المهملات إلى Supabase (دفعات 50 عنصر/طلب)`,
      });
      resolveToast(toastId, "success", `🎉 تمت استعادة ${restored.length} عنصر بنجاح إلى جداولها الأصلية!`);
      setSelectedIds([]);
    } catch (err: any) {
      resolveToast(toastId, "error", "فشلت الاستعادة الجماعية", err?.message || "حدث خطأ أثناء الاتصال بقاعدة البيانات");
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Permanent Delete Handlers ────────────────────────────────────────────
  const handleConfirmPermanentDelete = async () => {
    // 1. Close confirmation modal immediately to free UI
    const modalType = confirmDeleteModal;
    const singleItem = targetSingleItem;
    setConfirmDeleteModal(null);
    setTargetSingleItem(null);

    setIsProcessing(true);

    if (modalType === "single" && singleItem) {
      const toastId = toastLoading("جاري الحذف النهائي...", `حذف "${singleItem.entityName}" من Supabase`);
      try {
        await permanentDelete(singleItem.id);
        await reloadTrash();
        await logActivity({
          user: "manager",
          action: "delete",
          entity: singleItem.entity,
          entityId: singleItem.entityId,
          details: `حذف نهائي لـ "${singleItem.entityName}" من سلة المهملات`,
        });
        resolveToast(toastId, "success", `🗑️ تم الحذف النهائي لـ "${singleItem.entityName}"`);
        setSelectedIds((prev) => prev.filter((id) => id !== singleItem.id));
      } catch (err: any) {
        resolveToast(toastId, "error", "فشل الحذف النهائي", err?.message);
      } finally {
        setIsProcessing(false);
      }
    } else if (modalType === "bulk" && selectedIds.length > 0) {
      const total = selectedIds.length;
      // 2. Create single toast ID once before loop
      const toastId = toastLoading("جاري بدء الحذف النهائي...", `جاري معالجة 0 من ${total}...`);
      try {
        await bulkPermanentDelete(selectedIds, (processed, totalCount) => {
          // 3. Update the exact same toast in-place without triggering new toasts
          toastLoading(`جاري الحذف ${processed} من ${totalCount}... (دفعات 50 عنصر/طلب)`, "جاري معالجة قاعدة البيانات Supabase", toastId);
        });
        await reloadTrash();
        await logActivity({
          user: "manager",
          action: "delete",
          entity: "سلة المهملات",
          details: `حذف نهائي جماعي لـ ${total} عنصر من سلة المهملات`,
        });
        // 4. Resolve toast on completion
        resolveToast(toastId, "success", `🗑️ تم الحذف النهائي لـ ${total} عنصر بنجاح!`);
        setSelectedIds([]);
      } catch (err: any) {
        // 5. Resolve toast on failure
        resolveToast(toastId, "error", "فشلت العملية", err?.message || "حدث خطأ في قاعدة البيانات");
      } finally {
        setIsProcessing(false);
      }
    } else {
      setIsProcessing(false);
    }
  };

  // Purge expired items
  const handlePurgeExpired = async () => {
    const toastId = toastLoading("جاري تنظيف العناصر المنتهية...", "فحص تاريخ صلاحية عناصر سلة المهملات");
    try {
      const count = await purgeExpired();
      if (count > 0) {
        await logActivity({
          user: "manager",
          action: "delete",
          entity: "سلة المهملات",
          details: `حذف تلقائي لـ ${count} عنصر منتهي الصلاحية`,
        });
        resolveToast(toastId, "success", `🧹 تم تنظيف وحذف ${count} عنصر منتهي الصلاحية`);
      } else {
        resolveToast(toastId, "info", "لا توجد عناصر منتهية الصلاحية حالياً");
      }
    } catch (err: any) {
      resolveToast(toastId, "error", "حدث خطأ أثناء تنظيف العناصر", err?.message);
    }
  };

  // Countdown days helper
  const getDaysRemaining = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const diff = Math.ceil((deleted.getTime() + autoDeleteDays * 86400000 - now.getTime()) / 86400000);
    return Math.max(0, diff);
  };

  // Selected items breakdown for modal summary
  const selectedBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    const selectedSet = new Set(selectedIds);
    for (const item of items) {
      if (selectedSet.has(item.id)) {
        const arName = ENTITY_NAMES_AR[item.entity] || item.entity;
        map.set(arName, (map.get(arName) || 0) + 1);
      }
    }
    return Array.from(map.entries());
  }, [selectedIds, items]);

  return (
    <div className="space-y-6 w-full max-w-full" dir="rtl">
      {/* ── Page Header & Live Stats ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>🗑️</span>
            <span>سلة المهملات الذكية (Smart Trash Dashboard)</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
            إدارة شاملة مع نظام تحديد متقدم وحماية تلقائية لعناصر قاعدة البيانات Supabase
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 px-3.5 py-1.5 rounded-xl text-center">
            <span className="text-lg font-extrabold text-indigo-700 dark:text-indigo-300 block leading-none">
              {items.length}
            </span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">إجمالي المحذوفات</span>
          </div>

          <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 px-3.5 py-1.5 rounded-xl text-center">
            <span className="text-lg font-extrabold text-violet-700 dark:text-violet-300 block leading-none">
              {selectedIds.length}
            </span>
            <span className="text-[10px] text-violet-600 dark:text-violet-400 font-bold">محدد حالياً</span>
          </div>
        </div>
      </div>

      {/* ── Auto-delete Configuration Card ─────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">
                إعدادات الحذف التلقائي والصلاحية
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                تُحذف العناصر من Supabase تلقائياً بعد مرور الفترة الزمنية المحتشدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300">المهلة الزمنيّة:</label>
              <input
                type="number"
                min="1"
                max="365"
                value={tempDays}
                onChange={(e) => setTempDays(Math.max(1, parseInt(e.target.value) || 30))}
                className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-center text-xs font-bold focus:ring-2 focus:ring-indigo-400 outline-none"
              />
              <span className="text-xs font-bold text-gray-500">يوم</span>
              <button
                onClick={() => {
                  setAutoDeleteDays(tempDays);
                  toastSuccess(`تم تحديث مهلة الحذف التلقائي إلى ${tempDays} يوم`);
                }}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all"
              >
                تحديث
              </button>
            </div>

            <button
              onClick={handlePurgeExpired}
              className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>🧹</span>
              <span>تنظيف العناصر المنتهية الآن</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters & Date Range Bar ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm space-y-3">
        {/* Search row & Entity types */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              placeholder="🔍 ابحث بالاسم، حُذف بواسطة، أو اسم الكيان..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-400 outline-none text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute left-3 top-2.5 text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Entity type tabs */}
          <div className="flex gap-1.5 flex-wrap w-full md:w-auto">
            <button
              onClick={() => setEntityFilter("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                entityFilter === "all"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-400"
              }`}
            >
              الكل ({items.length})
            </button>

            {entities.map((e) => {
              const count = items.filter((i) => i.entity === e).length;
              const arName = ENTITY_NAMES_AR[e] || e;
              const icon = ENTITY_ICONS[e] || ENTITY_ICONS.default;
              return (
                <button
                  key={e}
                  onClick={() => setEntityFilter(e)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border flex items-center gap-1 ${
                    entityFilter === e
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-400"
                  }`}
                >
                  <span>{icon}</span>
                  <span>{arName} ({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Date presets & Quick selection row */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2">
          {/* Date presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1 ml-1">
              <span>🗓️</span>
              <span>تاريخ الحذف:</span>
            </span>

            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setDatePreset(p.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                  datePreset === p.key
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-violet-400"
                }`}
              >
                <span>{p.icon}</span> <span className="mr-1">{p.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Date Selectors */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => selectByPresetDate("today")}
              className="px-2.5 py-1 text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 transition-all border border-indigo-200 dark:border-indigo-700"
            >
              ✓ تحديد محذوفات اليوم
            </button>

            <button
              onClick={() => selectByPresetDate("last7")}
              className="px-2.5 py-1 text-[11px] font-bold bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-100 transition-all border border-violet-200 dark:border-violet-700"
            >
              ✓ تحديد محذوفات 7 أيام
            </button>
          </div>
        </div>

        {/* Custom date range inputs when preset === "custom" */}
        {datePreset === "custom" && (
          <div className="flex flex-wrap items-end gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-700">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-violet-700 dark:text-violet-300">من تاريخ</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-violet-300 dark:border-violet-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-violet-700 dark:text-violet-300">إلى تاريخ</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-violet-300 dark:border-violet-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {customFrom && customTo && (
              <span className="text-xs font-bold text-violet-700 dark:text-violet-300 mb-2">
                عدد النتائج بالنطاق: {filtered.length} عنصر
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky Floating Action Bar (Batch Operations Bar) ─────────────── */}
      {selectedIds.length > 0 && (
        <div className="sticky top-4 z-40 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl shadow-2xl border-2 border-indigo-500/50 animate-fadeIn flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-indigo-600 text-white px-3 py-0.5 rounded-full font-black text-xs">
                  {selectedIds.length} عنصر محدد
                </span>
                <span className="text-xs text-slate-300">من أصل {filtered.length} عنصر معروض</span>
              </div>
              <p className="text-[11px] text-indigo-200 mt-0.5">
                اختر العملية المجمعة لتطبيقها مباشرة في قاعدة البيانات Supabase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleBulkRestore}
              disabled={isProcessing}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <span>♻️</span>
              <span>تطبيق استعادة المحدد ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => setConfirmDeleteModal("bulk")}
              disabled={isProcessing}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <span>🗑️</span>
              <span>حذف نهائي للمحدد ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              disabled={isProcessing}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700"
            >
              ✖ إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* ── Main Data Table ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500">
            <span className="text-5xl block mb-3 opacity-60">🗑️</span>
            <p className="text-base font-bold text-gray-700 dark:text-gray-300">سلة المهملات فارغة في هذه الفلترة</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">جرّب تغيير فئة الفلترة أو تاريخ الحذف لمشاهدة عناصر أخرى</p>
          </div>
        ) : (
          <DataTableWrapper>
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/80">
                  {/* Select All Checkbox Header */}
                  <th className="w-12 px-4 py-3.5 text-center">
                    <IndeterminateCheckbox
                      checked={isAllSelected}
                      indeterminate={isPartialSelected}
                      onChange={toggleSelectAll}
                      title="تحديد الكل / إلغاء تحديد الكل"
                    />
                  </th>
                  <th className="px-4 py-3.5 text-right font-bold text-gray-700 dark:text-gray-300">النوع</th>
                  <th className="px-4 py-3.5 text-right font-bold text-gray-700 dark:text-gray-300 min-w-[220px] sticky right-0 z-20 bg-gray-50 dark:bg-gray-800 shadow-sm">
                    اسم العنصر المحذوف
                  </th>
                  <th className="px-4 py-3.5 text-right font-bold text-gray-700 dark:text-gray-300">حُذف بواسطة</th>
                  <th className="px-4 py-3.5 text-right font-bold text-gray-700 dark:text-gray-300">تاريخ وساعة الحذف</th>
                  <th className="px-4 py-3.5 text-right font-bold text-gray-700 dark:text-gray-300">الصلاحية المتبقية</th>
                  <th className="px-4 py-3.5 text-right font-bold text-gray-700 dark:text-gray-300 sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 shadow-md border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    الإجراءات المتاحة
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {filtered.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const daysLeft = getDaysRemaining(item.deletedAt);
                  const icon = ENTITY_ICONS[item.entity] || ENTITY_ICONS.default;
                  const arEntity = ENTITY_NAMES_AR[item.entity] || item.entity;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleSelectOne(item.id)}
                      className={`
                        group cursor-pointer transition-colors
                        ${
                          isSelected
                            ? "bg-indigo-50/80 dark:bg-indigo-900/25"
                            : "hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                        }
                      `}
                    >
                      {/* Checkbox cell */}
                      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(item.id)}
                          className="w-4 h-4 accent-indigo-600 rounded cursor-pointer transition-transform active:scale-95"
                        />
                      </td>

                      {/* Entity Type badge */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-base">{icon}</span>
                          <span className="font-bold text-xs px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                            {arEntity}
                          </span>
                        </div>
                      </td>

                      {/* Item Name */}
                      <td className="px-4 py-3.5 font-bold text-gray-900 dark:text-white min-w-[220px] sticky right-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/90 transition-colors shadow-sm whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{item.entityName}</span>
                          {item.data && (item.data as any).notes && (
                            <span className="text-[10px] text-gray-400 font-normal truncate max-w-[120px]">
                              ({(item.data as any).notes?.split("|")[0]?.trim()})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Deleted By */}
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 text-xs font-semibold whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px]">
                          👤 {item.deletedBy || "مدير"}
                        </span>
                      </td>

                      {/* Deleted At timestamp */}
                      <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap font-mono">
                        📅 {formatTimestamp(item.deletedAt)}
                      </td>

                      {/* Days Remaining Badge */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`
                            px-2.5 py-1 rounded-full text-xs font-extrabold whitespace-nowrap inline-flex items-center gap-1
                            ${
                              daysLeft <= 3
                                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800"
                                : daysLeft <= 10
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            }
                          `}
                        >
                          <span>{daysLeft <= 3 ? "⚠️" : "⏱️"}</span>
                          <span>متبقي {daysLeft} يوم</span>
                        </span>
                      </td>

                      {/* Single Action Buttons */}
                      <td
                        className="px-4 py-3.5 sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/90 transition-colors shadow-md border-r border-gray-200 dark:border-gray-700 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button
                            onClick={() => handleRestoreSingle(item)}
                            className="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1"
                            title="استعادة هذا العنصر إلى جداول Supabase النشطة"
                          >
                            <span>♻️</span>
                            <span>استعادة</span>
                          </button>

                          <button
                            onClick={() => {
                              setTargetSingleItem(item);
                              setConfirmDeleteModal("single");
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1"
                            title="حذف هذا العنصر نهائياً"
                          >
                            <span>🗑️</span>
                            <span>حذف نهائي</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTableWrapper>
        )}
      </div>

      {/* ── Permanent Delete Confirmation Modal ────────────────────────────── */}
      {confirmDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-red-200 dark:border-red-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-base font-extrabold text-red-700 dark:text-red-400">
                  تأكيد الحذف النهائي من Supabase
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  هذا الإجراء غير قابل للتراجع نهائياً
                </p>
              </div>
            </div>

            {/* Modal Body Info */}
            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 space-y-2 text-xs">
              {confirmDeleteModal === "single" && targetSingleItem && (
                <p className="font-bold text-red-800 dark:text-red-300">
                  هل أنت متأكد من الحذف النهائي لـ &quot;<strong>{targetSingleItem.entityName}</strong>&quot;؟
                </p>
              )}

              {confirmDeleteModal === "bulk" && (
                <div>
                  <p className="font-bold text-red-800 dark:text-red-300 mb-1.5">
                    سيتم حذف <strong>{selectedIds.length} عنصر</strong> نهائياً من قاعدة البيانات:
                  </p>
                  <ul className="space-y-1 text-red-700 dark:text-red-400 font-semibold pr-3 border-r-2 border-red-400">
                    {selectedBreakdown.map(([arName, count]) => (
                      <li key={arName}>• {arName}: {count} عنصر</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] text-red-600 dark:text-red-400 opacity-90">
                سيتم مسح البيانات بشكل دائم وتحديث كافة الفهارس في Supabase.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmPermanentDelete}
                disabled={isProcessing}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs disabled:opacity-50 transition-all shadow-md"
              >
                {isProcessing ? "جاري الحذف..." : "🗑️ نعم، احذف نهائياً"}
              </button>

              <button
                onClick={() => {
                  setConfirmDeleteModal(null);
                  setTargetSingleItem(null);
                }}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
