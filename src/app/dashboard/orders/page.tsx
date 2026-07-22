"use client";

import { useState, useMemo } from "react";
import { useNotifications, Notification } from "@/lib/notifications";
import { useSettings } from "@/lib/settings-context";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "قيد الانتظار", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
  confirmed: { label: "مؤكد", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
  shipped: { label: "قيد الشحن", color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
  delivered: { label: "تم التوصيل", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  cancelled: { label: "ملغي", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
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

export default function OrdersPage() {
  const { notifications } = useNotifications();
  const { settings } = useSettings();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const orderNotifications = useMemo(() => {
    return notifications.filter((n) => n.type === "info" && n.title.includes("طلب"));
  }, [notifications]);

  const filtered = useMemo(() => {
    if (filter === "unread") return orderNotifications.filter((n) => !n.read);
    return orderNotifications;
  }, [orderNotifications, filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الطلبات</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          طلبات الزبائن الواردة عبر المتجر
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
            <OrderCard key={n.id} notification={n} />
          ))
        )}
      </div>
    </div>
  );
}

function OrderCard({ notification }: { notification: Notification }) {
  const time = new Date(notification.timestamp).toLocaleString("ar-EG", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow ${!notification.read ? "border-r-4 border-r-[var(--primary)]" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🛒</span>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">{notification.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{notification.message}</p>
            <p className="text-xs text-gray-400 mt-2">{time}</p>
          </div>
        </div>
        {!notification.read && (
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
        )}
      </div>
    </div>
  );
}
