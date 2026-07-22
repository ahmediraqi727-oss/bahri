"use client";

import { useState, useMemo } from "react";
import { useActivityLog, formatAction, formatRole, formatTimestamp, ActivityEntry } from "@/lib/activity-log";

type ActionFilter = ActivityEntry["action"] | "all";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  restore: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  login: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  export: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  import: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
};

export default function ActivityPage() {
  const { activities, clearActivities } = useActivityLog();
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (actionFilter !== "all" && a.action !== actionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          a.entity.toLowerCase().includes(q) ||
          a.details.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activities, actionFilter, searchQuery]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach((a) => {
      counts[a.action] = (counts[a.action] || 0) + 1;
    });
    return counts;
  }, [activities]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">سجل الحركات</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            تتبع جميع الإجراءات والتعديلات في النظام
          </p>
        </div>
        {activities.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            مسح السجل
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{activities.length}</p>
          <p className="text-xs text-gray-500">الإجمالي</p>
        </div>
        {Object.entries(stats).map(([action, count]) => (
          <div key={action} className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
            <p className="text-xs text-gray-500">{formatAction(action as ActivityEntry["action"])}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="بحث في السجل..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
        />
        <div className="flex gap-2 flex-wrap">
          {(["all", "create", "update", "delete", "restore", "login", "export", "import"] as ActionFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setActionFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                actionFilter === f
                  ? "bg-[var(--primary)] text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {f === "all" ? "الكل" : formatAction(f)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <span className="text-4xl block mb-3">📝</span>
            <p>لا توجد حركات مسجلة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الوقت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المستخدم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الإجراء</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الكيان</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">{formatRole(entry.user)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ACTION_COLORS[entry.action] || ""}`}>
                        {formatAction(entry.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{entry.entity}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">{entry.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">مسح سجل الحركات</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              هل أنت متأكد من مسح جميع الحركات؟ هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                إلغاء
              </button>
              <button
                onClick={async () => { await clearActivities(); setShowClearConfirm(false); }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                مسح الكل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
