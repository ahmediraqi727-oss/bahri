"use client";

import { useState } from "react";
import { useSettings } from "@/lib/settings-context";
import { useNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase-client";

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactSupportModal({ isOpen, onClose }: ContactSupportModalProps) {
  const { settings } = useSettings();
  const { addNotification } = useNotifications();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isOpen) return null;

  // Clean WhatsApp number
  const rawWa = settings.whatsappLink || settings.phoneLink || "07800000000";
  const cleanWaNumber = rawWa.replace(/[^0-9]/g, "");
  const formattedWaNumber = cleanWaNumber.startsWith("964")
    ? cleanWaNumber
    : cleanWaNumber.startsWith("07")
    ? `964${cleanWaNumber.substring(1)}`
    : `964${cleanWaNumber}`;

  const waUrl = `https://wa.me/${formattedWaNumber}?text=${encodeURIComponent(
    `سلام عليكم، استفسار من متجر ${settings.siteName || "أحمد بحري"}:`
  )}`;

  const phoneUrl = `tel:${settings.phoneLink || "07800000000"}`;
  const telegramUrl = settings.telegramLink || "";
  const messengerUrl = settings.messengerLink || "";

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;

    setSending(true);
    try {
      // 1. Insert into Supabase notifications table for Real-Time Admin Alert
      await supabase.from("notifications").insert({
        id: crypto.randomUUID(),
        type: "contact",
        title: `📩 رسالة دعم فني جديدة من: ${name.trim()}`,
        message: `${message.trim()} (هاتف: ${phone.trim() || "غير محدد"})`,
        read: false,
        created_at: new Date().toISOString(),
      });

      // 2. Also log in notifications hook
      addNotification({
        type: "contact",
        title: `📩 رسالة دعم من: ${name.trim()}`,
        message: message.trim(),
      });

      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setName("");
        setPhone("");
        setMessage("");
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Send contact message error:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose} dir="rtl">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl overflow-hidden animate-scaleUp text-right" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xl font-bold">
              💬
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">التواصل والدعم الفني</h3>
              <p className="text-xs text-gray-400">تواصل مباشر مع إدارة متجر {settings.siteName || "أحمد بحري"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg">✕</button>
        </div>

        <div className="space-y-4">
          {/* Quick Direct Communication Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* WhatsApp */}
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-2xl font-extrabold text-xs sm:text-sm border border-emerald-200 dark:border-emerald-800/40 hover:scale-[1.02] transition-transform shadow-xs"
            >
              <span className="text-lg">💬</span> محادثة واتساب
            </a>

            {/* Direct Phone Call */}
            <a
              href={phoneUrl}
              className="flex items-center justify-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-2xl font-extrabold text-xs sm:text-sm border border-blue-200 dark:border-blue-800/40 hover:scale-[1.02] transition-transform shadow-xs"
            >
              <span className="text-lg">📞</span> اتصال هاتفي
            </a>

            {/* Telegram if configured */}
            {telegramUrl && (
              <a
                href={telegramUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 p-3 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 rounded-2xl font-extrabold text-xs sm:text-sm border border-sky-200 dark:border-sky-800/40 hover:scale-[1.02] transition-transform shadow-xs"
              >
                <span className="text-lg">✈️</span> قناة تليجرام
              </a>
            )}

            {/* Messenger if configured */}
            {messengerUrl && (
              <a
                href={messengerUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-2xl font-extrabold text-xs sm:text-sm border border-indigo-200 dark:border-indigo-800/40 hover:scale-[1.02] transition-transform shadow-xs"
              >
                <span className="text-lg">⚡</span> ماسنجر
              </a>
            )}
          </div>

          {/* Social Links Row if configured */}
          {(settings.facebookLink || settings.instagramLink || settings.tiktokLink || settings.youtubeLink) && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60">
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-2">تابعنا على وسائل التواصل الاجتماعي:</p>
              <div className="flex items-center gap-2 flex-wrap">
                {settings.facebookLink && (
                  <a href={settings.facebookLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:opacity-90">📘 فيسبوك</a>
                )}
                {settings.instagramLink && (
                  <a href={settings.instagramLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-pink-600 text-white rounded-xl text-xs font-bold hover:opacity-90">📷 إنستغرام</a>
                )}
                {settings.tiktokLink && (
                  <a href={settings.tiktokLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:opacity-90">🎵 تيك توك</a>
                )}
                {settings.youtubeLink && (
                  <a href={settings.youtubeLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:opacity-90">▶️ يوتيوب</a>
                )}
              </div>
            </div>
          )}

          {/* Direct Message Form to Admin */}
          <form onSubmit={handleSendMessage} className="p-4 bg-gradient-to-br from-teal-50/50 to-blue-50/50 dark:from-teal-950/20 dark:to-blue-950/20 rounded-2xl border border-teal-100 dark:border-teal-900/40 space-y-3">
            <p className="text-xs font-extrabold text-teal-900 dark:text-teal-200">✉️ إرسال رسالة مباشرة لإدارة المتجر</p>
            <div>
              <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">الاسم الكامل: *</label>
              <input
                type="text"
                required
                placeholder="أدخل اسمك..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">رقم الهاتف (لإعادة الاتصال):</label>
              <input
                type="tel"
                placeholder="078..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">نص الاستفسار أو الرسالة: *</label>
              <textarea
                required
                rows={3}
                placeholder="اكتب استفسارك أو طلبك هنا..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-teal-500 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={sending || sentSuccess}
              className={`w-full py-2.5 rounded-xl text-xs font-extrabold text-white transition-all shadow-sm ${
                sentSuccess
                  ? "bg-emerald-600"
                  : sending
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-teal-600 hover:bg-teal-700"
              }`}
            >
              {sentSuccess ? "✅ تم إرسال الرسالة بنجاح!" : sending ? "جارٍ الإرسال..." : "إرسال الرسالة للمدير 🚀"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
