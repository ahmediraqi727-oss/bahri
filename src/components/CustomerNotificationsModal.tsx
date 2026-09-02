"use client";

import React, { useState, useEffect } from "react";
import { useNotifications, Notification } from "@/lib/notifications";
import { useSettings } from "@/lib/settings-context";
import { useRouter } from "next/navigation";

interface CustomerNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = "all" | "orders" | "support" | "stock" | "system";

interface FilterTabItem {
  id: FilterTab;
  label: string;
  shortLabel?: string;
  count?: number;
}

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

function getNotificationIcon(type: string): string {
  const typeLower = (type || "").toLowerCase();
  if (typeLower.includes("order") || typeLower.includes("invoice") || typeLower.includes("checkout") || typeLower.includes("purchase")) return "🛒";
  if (typeLower.includes("message") || typeLower.includes("contact") || typeLower.includes("chat") || typeLower.includes("ticket")) return "💬";
  if (typeLower.includes("stock") || typeLower.includes("out_of_stock")) return "⚠️";
  if (typeLower.includes("product")) return "📦";
  if (typeLower.includes("broadcast") || typeLower.includes("offer") || typeLower.includes("system")) return "📢";
  if (typeLower.includes("inquiry")) return "❓";
  if (typeLower.includes("customer")) return "👥";
  return "🔔";
}

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
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [remText, setRemText] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!muteUntil) {
      setRemText("");
      return;
    }
    setRemText(formatRemainingTime(muteUntil));
    const interval = setInterval(() => {
      const remaining = formatRemainingTime(muteUntil);
      setRemText(remaining || "");
    }, 10000);
    return () => clearInterval(interval);
  }, [muteUntil]);

  if (!isOpen) return null;

  const handleTestChime = () => {
    playChime(settings.notificationSoundUrl, settings.notificationVolume ?? 0.8);
  };

  const handleNotificationAction = (n: Notification) => {
    if (!n.read) {
      markAsRead(n.id);
    }
    onClose();

    const typeLower = (n.type || "").toLowerCase();
    const titleLower = (n.title || "").toLowerCase();
    const msgLower = (n.message || "").toLowerCase();

    if (
      typeLower.includes("order") || 
      typeLower.includes("invoice") || 
      typeLower.includes("checkout") ||
      typeLower.includes("purchase") ||
      titleLower.includes("طلب") || 
      titleLower.includes("شراء") ||
      titleLower.includes("فاتورة") ||
      msgLower.includes("طلب") ||
      msgLower.includes("فاتورة")
    ) {
      router.push("/dashboard/invoices");
      return;
    }

    if (
      typeLower.includes("message") || 
      typeLower.includes("contact") || 
      typeLower.includes("chat") ||
      typeLower.includes("ticket") ||
      titleLower.includes("رسالة") ||
      titleLower.includes("محادثة")
    ) {
      router.push("/dashboard/messages");
      return;
    }

    if (
      typeLower.includes("stock") || 
      typeLower.includes("product") ||
      typeLower.includes("low_stock") ||
      typeLower.includes("out_of_stock") ||
      titleLower.includes("مخزون") ||
      titleLower.includes("منتج")
    ) {
      router.push("/dashboard/products");
      return;
    }

    if (
      typeLower.includes("inquiry") ||
      typeLower.includes("question") ||
      titleLower.includes("استفسار") ||
      titleLower.includes("سؤال")
    ) {
      router.push("/dashboard/settings");
      return;
    }

    if (
      typeLower.includes("customer") ||
      typeLower.includes("user_signup") ||
      titleLower.includes("عميل") ||
      titleLower.includes("مستخدم")
    ) {
      router.push("/dashboard/customers");
      return;
    }

    setSelectedNotification(n);
  };

  const filteredNotifications = notifications.filter((n) => {
    const typeLower = (n.type || "").toLowerCase();
    const titleLower = (n.title || "").toLowerCase();
    const msgLower = (n.message || "").toLowerCase();

    if (activeTab === "all") return true;

    if (activeTab === "orders") {
      return (
        typeLower.includes("order") ||
        typeLower.includes("invoice") ||
        typeLower.includes("checkout") ||
        typeLower.includes("purchase") ||
        titleLower.includes("طلب") ||
        titleLower.includes("فاتورة") ||
        titleLower.includes("شراء") ||
        msgLower.includes("طلب") ||
        msgLower.includes("فاتورة")
      );
    }

    if (activeTab === "support") {
      return (
        typeLower.includes("message") ||
        typeLower.includes("contact") ||
        typeLower.includes("chat") ||
        typeLower.includes("ticket") ||
        titleLower.includes("رسالة") ||
        titleLower.includes("محادثة") ||
        titleLower.includes("دعم")
      );
    }

    if (activeTab === "stock") {
      return (
        typeLower.includes("stock") ||
        typeLower.includes("product") ||
        typeLower.includes("low_stock") ||
        typeLower.includes("out_of_stock") ||
        titleLower.includes("مخزون") ||
        titleLower.includes("منتج")
      );
    }

    if (activeTab === "system") {
      return (
        typeLower.includes("broadcast") ||
        typeLower.includes("system") ||
        typeLower.includes("offer") ||
        typeLower.includes("info") ||
        titleLower.includes("عرض") ||
        titleLower.includes("نظام") ||
        titleLower.includes("تنويه")
      );
    }

    return true;
  });

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
        onClick={onClose}
        dir="rtl"
      >
        <div
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden text-right flex flex-col h-[90vh] max-h-[750px] transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex-shrink-0 bg-gradient-to-r from-violet-50 to-indigo-50/40 dark:from-violet-950/30 dark:to-indigo-950/30">
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
                <h3 className="font-extrabold text-base text-gray-900 dark:text-white">مركز الإشعارات والتنبيهات</h3>
                <p className="text-xs text-gray-400">الإشعارات والتنبيهات المباشرة والعروض</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg cursor-pointer">
              ✕
            </button>
          </div>

          {/* Audio Mute Control Panel */}
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
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800/40 hover:bg-violet-100 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>🔊</span> تجربة النغمة
              </button>
            </div>

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
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer ${
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

          {/* Smart Category Filter Tabs Bar */}
          <div className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full touch-pan-x snap-x snap-mandatory scroll-smooth scroll-px-2">
              {(
                [
                  { id: "all", label: "الكل", shortLabel: "الكل", count: notifications.length },
                  { id: "orders", label: "🛒 الطلبات والفواتير", shortLabel: "🛒 الطلبات" },
                  { id: "support", label: "💬 رسائل الدعم", shortLabel: "💬 الدعم" },
                  { id: "stock", label: "⚠️ المخزون والمنتجات", shortLabel: "⚠️ المخزون" },
                  { id: "system", label: "📢 العروض والنظام", shortLabel: "📢 العروض" },
                ] as FilterTabItem[]
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap flex-shrink-0 snap-start flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      active
                        ? "bg-violet-600 text-white shadow-sm scale-102"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
                    {tab.count !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${active ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Controls */}
          <div className="px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0 bg-white dark:bg-gray-900">
            <span className="text-xs font-bold text-gray-500">
              الإشعارات المفلترة ({filteredNotifications.length})
            </span>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
                >
                  تحديد الكل كمقروء ✓
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => clearAll()}
                  className="text-[11px] font-bold text-red-500 hover:underline cursor-pointer"
                >
                  مسح الكل 🗑️
                </button>
              )}
            </div>
          </div>

          {/* Notification Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-gray-950/40">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                <div className="animate-spin w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full ml-2" />
                جارٍ تحميل التنبيهات...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center space-y-3">
                <span className="text-5xl opacity-60">🔔</span>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400">لا توجد إشعارات حالياً في هذا التصنيف</p>
                <p className="text-[11px] text-gray-400 max-w-xs">ستصلك التنبيهات الخاصة بالعروض والرسائل والمنشورات هنا فور صدورها.</p>
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationAction(n)}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    !n.read
                      ? "bg-violet-50/60 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800/60 shadow-sm"
                      : "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/60 opacity-80 hover:opacity-100"
                  }`}
                >
                  {/* Right Side: Icon & Notification Content */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="text-2xl p-2 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                      {getNotificationIcon(n.type)}
                    </span>
                    <div className="min-w-0 flex-1 text-right">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-white truncate">
                          {n.title}
                        </h4>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                      <span className="text-[10px] text-gray-400 mt-1.5 block font-medium">
                        {timeAgo(n.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Left Side: Direct "إظهار" Action CTA Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNotificationAction(n);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                  >
                    <span>إظهار</span>
                    <span>👁️</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Fallback Text Detail Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl max-w-lg w-full overflow-hidden text-right transform transition-all">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between bg-gray-50/80 dark:bg-gray-800/80">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2 bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600">
                  {getNotificationIcon(selectedNotification.type)}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedNotification.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>التوقيت: {timeAgo(selectedNotification.timestamp)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotification(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700/80">
                <p className="text-xs text-gray-400 font-medium mb-1">📅 التاريخ والوقت:</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {new Date(selectedNotification.timestamp).toLocaleString("ar-IQ", {
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
                <div className="bg-violet-50/50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800/30 rounded-xl p-4 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                  {selectedNotification.message}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-end gap-2">
              <button
                onClick={() => setSelectedNotification(null)}
                className="px-5 py-2.5 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-xl font-bold hover:opacity-90 transition-opacity text-sm cursor-pointer"
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
