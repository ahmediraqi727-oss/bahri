"use client";

import { useState, useRef, useEffect } from "react";
import { useNotifications, Notification } from "@/lib/notifications";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TYPE_ICONS: Record<string, string> = {
  low_stock: "⚠️",
  out_of_stock: "🔴",
  info: "ℹ️",
  message: "💬",
  contact: "💬",
};

const TYPE_LABELS: Record<string, string> = {
  low_stock: "تخزين منخفض",
  out_of_stock: "نفاد من المخزون",
  info: "معلومات / طلب",
  message: "رسالة زبون",
  contact: "رسالة دعم فني",
};

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

export default function NotificationsBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const router = useRouter();

  const handleSelectNotification = (n: Notification) => {
    if (!n.read) {
      markAsRead(n.id);
    }
    setSelectedNotification(n);
    setOpen(false);
    // Route message/contact notifications to messages hub
    if (n.type === "message" || n.type === "contact") {
      router.push("/dashboard/messages");
    }
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xl"
          title="الإشعارات والتنبيهات"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl z-50 overflow-hidden" dir="rtl">
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">🔔 قائمة الإشعارات</h3>
                {unreadCount > 0 && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-bold">
                    {unreadCount} جديد
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 font-medium">
                    تعليم الكل كـ مقروء
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-red-500 hover:underline px-2 py-1 font-medium">
                    مسح الكل
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  <span className="text-3xl block mb-2">🔕</span>
                  لا توجد إشعارات حالياً
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleSelectNotification(n)}
                    className={`p-3.5 cursor-pointer hover:bg-blue-50/60 dark:hover:bg-gray-800/80 transition-colors ${
                      !n.read ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg">{TYPE_ICONS[n.type] || "🔔"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{n.title}</p>
                          {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 animate-ping" />}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2 leading-relaxed">
                          {n.message}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-100 dark:border-gray-800/40 text-[10px] text-gray-400">
                          <span>{timeAgo(n.timestamp)}</span>
                          <span className="text-blue-500 hover:underline font-semibold flex items-center gap-1">
                            عرض التفاصيل الكاملة 👁️
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Link
              href="/dashboard/orders"
              onClick={() => setOpen(false)}
              className="block w-full py-2.5 bg-gray-50 dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold text-center text-xs border-t border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            >
              🛒 الانتقال إلى صفحة الطلبات والتنبيهات ➔
            </Link>
          </div>
        )}
      </div>

      {/* Notification Details Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl max-w-lg w-full overflow-hidden text-right transform transition-all">
            {/* Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between bg-gray-50/80 dark:bg-gray-800/80">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2 bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600">
                  {TYPE_ICONS[selectedNotification.type] || "🔔"}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedNotification.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>نوع الإشعار: <b>{TYPE_LABELS[selectedNotification.type] || "تنبيه"}</b></span>
                    <span>•</span>
                    <span>{timeAgo(selectedNotification.timestamp)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotification(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Body Details */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700/80">
                <p className="text-xs text-gray-400 font-medium mb-1">📅 التاريخ والوقت:</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {new Date(selectedNotification.timestamp).toLocaleString("ar-EG", {
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
                <p className="text-xs text-gray-400 font-medium mb-2">💬 نص الإشعار والتفاصيل الكاملة:</p>
                <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-4 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                  {selectedNotification.message}
                </div>
              </div>

              {selectedNotification.type === "info" || selectedNotification.title.includes("طلب") ? (
                <div className="pt-2">
                  <Link
                    href="/dashboard/orders"
                    onClick={() => setSelectedNotification(null)}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-center hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm"
                  >
                    🛒 الانتقال فوراً إلى صفحة الطلبات
                  </Link>
                </div>
              ) : selectedNotification.productId ? (
                <div className="pt-2">
                  <Link
                    href="/dashboard/inventory"
                    onClick={() => setSelectedNotification(null)}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-center hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm"
                  >
                    📦 الانتقال إلى المخزون والمنتجات
                  </Link>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-end gap-2">
              <button
                onClick={() => setSelectedNotification(null)}
                className="px-5 py-2.5 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-xl font-bold hover:opacity-90 transition-opacity text-sm"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
