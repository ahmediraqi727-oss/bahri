"use client";

import { useState, useMemo } from "react";
import { useNotifications, Notification } from "@/lib/notifications";
import { useSettings } from "@/lib/settings-context";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export default function OrdersPage() {
  const { notifications, markAsRead } = useNotifications();
  const { settings } = useSettings();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [selectedOrder, setSelectedOrder] = useState<Notification | null>(null);

  const orderNotifications = useMemo(() => {
    return notifications.filter((n) => n.type === "info" || n.title.includes("طلب"));
  }, [notifications]);

  const filtered = useMemo(() => {
    if (filter === "unread") return orderNotifications.filter((n) => !n.read);
    return orderNotifications;
  }, [orderNotifications, filter]);

  const handleCardClick = (n: Notification) => {
    if (!n.read) {
      markAsRead(n.id);
    }
    setSelectedOrder(n);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🛒 طلبات الزبائن والتنبيهات</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          قائمة بجميع طلبات الشراء الواردة والتنبيهات، اضغط على أي طلب لعرض تفاصيله بالكامل.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            filter === "all" ? "bg-[var(--primary)] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
          }`}
        >
          الكل ({orderNotifications.length})
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            filter === "unread" ? "bg-[var(--primary)] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
          }`}
        >
          غير مقروء ({orderNotifications.filter((n) => !n.read).length})
        </button>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
            <span className="text-4xl block mb-3">🛒</span>
            <p>{filter === "unread" ? "لا توجد طلبات غير مقروءة" : "لا توجد طلبات بعد"}</p>
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              onClick={() => handleCardClick(n)}
              className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg transition-all cursor-pointer ${
                !n.read ? "border-r-4 border-r-blue-600 bg-blue-50/20 dark:bg-blue-950/10" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-2xl p-2 bg-gray-100 dark:bg-gray-800 rounded-xl">🛒</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 dark:text-white">{n.title}</h3>
                      {!n.read && <span className="text-[10px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">جديد</span>}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-2">
                      <span>{timeAgo(n.timestamp)}</span>
                      <span>•</span>
                      <span className="text-blue-500 font-semibold hover:underline">اضغط لعرض التفاصيل 🔍</span>
                    </p>
                  </div>
                </div>
                {!n.read && <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Order / Notification Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl max-w-lg w-full overflow-hidden text-right">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between bg-gray-50/80 dark:bg-gray-800/80">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2 bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600">
                  🛒
                </span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedOrder.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {timeAgo(selectedOrder.timestamp)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400 font-medium mb-1">📅 تاريخ ووقت التسجيل:</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {new Date(selectedOrder.timestamp).toLocaleString("ar-EG", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">📋 التفاصيل والمعلومات الواردة:</p>
                <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-4 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                  {selectedOrder.message}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-end">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-5 py-2.5 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-xl font-bold hover:opacity-90 transition-opacity text-sm"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
