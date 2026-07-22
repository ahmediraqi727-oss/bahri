"use client";

import { useState, useMemo } from "react";
import { useTrash, TrashItem } from "@/lib/trash";
import { useActivityLog, formatTimestamp } from "@/lib/activity-log";

const ENTITY_ICONS: Record<string, string> = {
  product: "📦",
  supplier: "🚚",
  order: "🛒",
  customer: "👤",
  default: "📄",
};

export default function TrashPage() {
  const { items, restore, permanentDelete, purgeExpired, autoDeleteDays, setAutoDeleteDays } = useTrash();
  const { logActivity } = useActivityLog();
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const entities = useMemo(() => {
    const set = new Set(items.map((i) => i.entity));
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (entityFilter !== "all" && item.entity !== entityFilter) return false;
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
  }, [items, entityFilter, searchQuery]);

  const handleRestore = async (item: TrashItem) => {
    const restored = await restore(item.id);
    if (restored) {
      await logActivity({
        user: "manager",
        action: "restore",
        entity: restored.entity,
        entityId: restored.entityId,
        details: `تمت استعادة "${restored.entityName}" من سلة المهملات`,
      });
    }
  };

  const handlePurgeExpired = async () => {
    const count = await purgeExpired();
    if (count > 0) {
      await logActivity({
        user: "manager",
        action: "delete",
        entity: "سلة المهملات",
        details: `تم حذف ${count} عنصر(عناصر) منتهي الصلاحية تلقائياً`,
      });
    }
  };

  const getDaysRemaining = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const diff = Math.ceil((deleted.getTime() + autoDeleteDays * 86400000 - now.getTime()) / 86400000);
    return Math.max(0, diff);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">سلة المهملات الذكية</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          العناصر المحذوفة تُحفظ هنا قبل الحذف النهائي التلقائي
        </p>
      </div>

      {/* Auto-delete settings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">إعدادات الحذف التلقائي</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              العناصر تُحذف نهائياً بعد انتهاء المدة المحددة
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">عدد الأيام:</label>
              <input
                type="number"
                min="1"
                max="365"
                value={autoDeleteDays}
                onChange={(e) => setAutoDeleteDays(Math.max(1, parseInt(e.target.value) || 30))}
                className="w-20 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
              />
              <span className="text-sm text-gray-500">يوم</span>
            </div>
            <button
              onClick={handlePurgeExpired}
              className="px-4 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              حذف المنتهي الآن
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="بحث في السلة..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
        />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setEntityFilter("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              entityFilter === "all"
                ? "bg-[var(--primary)] text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            }`}
          >
            الكل ({items.length})
          </button>
          {entities.map((e) => (
            <button
              key={e}
              onClick={() => setEntityFilter(e)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                entityFilter === e
                  ? "bg-[var(--primary)] text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              {e} ({items.filter((i) => i.entity === e).length})
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <span className="text-4xl block mb-3">🗑️</span>
            <p>سلة المهملات فارغة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">النوع</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الاسم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">حُذف بواسطة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">تاريخ الحذف</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الأيام المتبقية</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((item) => {
                  const daysLeft = getDaysRemaining(item.deletedAt);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{ENTITY_ICONS[item.entity] || ENTITY_ICONS.default}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{item.entity}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{item.entityName}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{item.deletedBy}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{formatTimestamp(item.deletedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          daysLeft <= 3
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : daysLeft <= 10
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        }`}>
                          {daysLeft} يوم
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRestore(item)}
                            className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          >
                            استعادة
                          </button>
                          <button
                            onClick={() => setConfirmDelete(item.id)}
                            className="px-3 py-1 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            حذف نهائي
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Permanent Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">حذف نهائي</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              هذا الإجراء لا يمكن التراجع عنه. العنصر سيُحذف نهائياً.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                إلغاء
              </button>
              <button
                onClick={async () => {
                  const item = items.find((i) => i.id === confirmDelete);
                  if (item) {
                    await logActivity({
                      user: "manager",
                      action: "delete",
                      entity: item.entity,
                      entityId: item.entityId,
                      details: `حذف نهائي لـ "${item.entityName}" من سلة المهملات`,
                    });
                  }
                  await permanentDelete(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
