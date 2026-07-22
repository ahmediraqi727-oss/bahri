"use client";

import { useState, useRef, useEffect } from "react";
import { useNotifications, Notification } from "@/lib/notifications";

const TYPE_ICONS: Record<string, string> = {
  low_stock: "⚠️",
  out_of_stock: "🔴",
  info: "ℹ️",
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xl"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden" dir="rtl">
          <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">الإشعارات</h3>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-[var(--primary)] hover:underline px-2 py-1"> قراءة الكل</button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-xs text-red-500 hover:underline px-2 py-1">مسح</button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">لا توجد إشعارات</div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={markAsRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  return (
    <div
      onClick={() => !notification.read && onRead(notification.id)}
      className={`p-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
        !notification.read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">{TYPE_ICONS[notification.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{notification.title}</p>
            {!notification.read && <div className="w-2 h-2 rounded-full bg-blue-500" />}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{notification.message}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{timeAgo(notification.timestamp)}</p>
        </div>
      </div>
    </div>
  );
}
