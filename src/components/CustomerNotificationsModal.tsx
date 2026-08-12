"use client";

import React, { useState, useEffect } from "react";
import { useNotifications, Notification, MuteDurationType } from "@/lib/notifications";
import { useSettings } from "@/lib/settings-context";

interface CustomerNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatRemainingTime(muteUntil: string | null): string {
  if (!muteUntil) return "";
  const diff = new Date(muteUntil).getTime() - Date.now();
  if (diff <= 0) return "";
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `متبقي ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `متبقي ${hours} ساعة ${remMins > 0 ? `و ${remMins} دقيقة` : ""}`;
}

const TYPE_ICONS: Record<string, string> = {
  low_stock: "⚠️",
  out_of_stock: "🔴",
  info: "ℹ️",
  message: "💬",
  contact: "✉️",
};

export default function CustomerNotificationsModal({ isOpen, onClose }: CustomerNotificationsModalProps) {
  const {
    notifications,
    unreadCount,
    loading,
    isMuted,
    muteUntil,
    muteDuration,
    setMuteTimer,
    playChime,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();
  const { settings } = useSettings();
  const [remText, setRemText] = useState("");

  useEffect(() => {
    if (!muteUntil) {
      setRemText("");
      return;
    }
    setRemText(formatRemainingTime(muteUntil));
    const interval = setInterval(() => {
      const remaining = formatRemainingTime(muteUntil);
      if (!remaining) {
        setRemText("");
      } else {
        setRemText(remaining);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [muteUntil]);

  if (!isOpen) return null;

  const handleTestChime = () => {
    playChime(settings.notificationSoundUrl, settings.notificationVolume ?? 0.8);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden text-right flex flex-col h-[85vh] max-h-[700px]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "scaleUp 0.2s ease" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex-shrink-0 bg-gradient-to-r from-violet-50 to-indigo-50/40 dark:from-violet-950/20 dark:to-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center text-xl shadow-md relative">
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-extrabold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">مركز الشعارات والتنبيهات</h3>
              <p className="text-xs text-gray-400">الإشعارات والتنبيهات المباشرة والعروض</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg">
            ✕
          </button>
        </div>

        {/* Audio Mute & Mode Control Panel */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isMuted ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              <span className="text-xs font-extrabold text-gray-800 dark:text-gray-200">
                {isMuted ? "وضع الصامت المؤقت 🌙" : "الوضع العام (التنبيهات مفعلة) 🟢"}
              </span>
            </div>
            <button
              onClick={handleTestChime}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800/40 hover:bg-violet-100 transition-colors flex items-center gap-1"
            >
              <span>🔊</span> تجربة النغمة
            </button>
          </div>

          {/* Duration Selector Buttons */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[11px] text-gray-500 dark:text-gray-400 font-bold">
              <span>كتم التنبيهات الصوتية لمدة:</span>
              {isMuted && remText && (
                <span className="text-amber-600 dark:text-amber-400 font-bold">{remText} (استعادة تلقائية)</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: "none", label: "مفعّل (عام)" },
                  { id: "1h", label: "1 ساعة" },
                  { id: "4h", label: "4 ساعات" },
                  { id: "24h", label: "24 ساعة" },
                ] as const
              ).map((item) => {
                const active = muteDuration === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setMuteTimer(item.id)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                      active
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-violet-400"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0 bg-white dark:bg-gray-900">
          <span className="text-xs font-bold text-gray-500">
            الإشعارات ({notifications.length})
          </span>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
              >
                تحديد الكل كمقروء ✓
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={() => clearAll()}
                className="text-[11px] font-bold text-red-500 hover:underline"
              >
                مسح الكل 🗑️
              </button>
            )}
          </div>
        </div>

        {/* Notification Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-gray-50/50 dark:bg-gray-950/40">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <div className="animate-spin w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full ml-2" />
              جارٍ تحميل التنبيهات...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center space-y-3">
              <span className="text-5xl opacity-60">🔔</span>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">لا توجد إشعارات جديدة حالياً</p>
              <p className="text-[11px] text-gray-400 max-w-xs">ستصلك التنبيهات الخاصة بالعروض والرسائل والمنشورات هنا فور صدورها.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markAsRead(n.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  n.read
                    ? "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-80"
                    : "bg-gradient-to-r from-violet-50/80 to-indigo-50/50 dark:from-violet-950/30 dark:to-indigo-950/30 border-violet-200 dark:border-violet-800/40 shadow-xs"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-300 text-base flex items-center justify-center flex-shrink-0 mt-0.5">
                    {TYPE_ICONS[n.type] || "🔔"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-extrabold text-gray-900 dark:text-white truncate">{n.title}</p>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-violet-600 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed mt-1 whitespace-pre-line">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1.5">{new Date(n.timestamp).toLocaleString("ar-IQ")}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
