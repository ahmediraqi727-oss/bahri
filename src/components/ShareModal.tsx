"use client";

import { useSettings } from "@/lib/settings-context";
import { useToast } from "@/components/ToastProvider";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  url?: string;
}

export default function ShareModal({ isOpen, onClose, title, url }: ShareModalProps) {
  const { settings } = useSettings();
  const { success } = useToast();

  if (!isOpen) return null;

  const currentUrl = url || (typeof window !== "undefined" ? window.location.href : "");
  const shareTitle = title || settings.siteName || "موقع أحمد بحري";

  // Native Web Share API
  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `تفقد ${shareTitle} للحصول على أفضل قطع الغيار والخدمات!`,
          url: currentUrl,
        });
        success("تم مشاركة الرابط بنجاح!");
      } catch (err) {
        console.warn("Share error:", err);
      }
    } else {
      handleCopyLink();
    }
  };

  // Copy to Clipboard
  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      success("تم نسخ الرابط للأنشطة والحافظة بنجاح! 📋");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors text-xs"
          >
            ✕
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
              🔗
            </div>
            <div>
              <h3 className="text-base font-extrabold">المشاركة الذكية وتطبيق الهاتف</h3>
              <p className="text-xs text-purple-100 mt-0.5">شارك المتجر أو قم بتحميل التطبيق الرسمي</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Quick Copy Link Box */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">رابط الصفحة الحالي:</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={currentUrl}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs text-gray-800 dark:text-gray-200 outline-none truncate"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shrink-0 shadow-sm"
              >
                📋 نسخ
              </button>
            </div>
          </div>

          {/* Social Share Buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">مشاركة سريعة عبر المنصات:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleNativeShare}
                className="py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <span>📲</span> مشاركة الهاتف الذكية
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${shareTitle}: ${currentUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <span>💬</span> مشاركة عبر واتساب
              </a>

              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(shareTitle)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <span>✈️</span> مشاركة عبر تليكرام
              </a>

              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <span>📘</span> فيسبوك
              </a>
            </div>
          </div>

          {/* Mobile App Download Banner (If configured by admin) */}
          {(settings.appDownloadUrl || settings.androidAppUrl || settings.iosAppUrl) && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 rounded-2xl border border-blue-200 dark:border-blue-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-blue-900 dark:text-blue-200">
                <span>📱</span>
                <span>تطبيق الهاتف الذكي الرسمي</span>
              </div>
              <p className="text-[11px] text-blue-700 dark:text-blue-300">
                حمل تطبيقنا الرسمي الآن على هاتفك للحصول على إشعارات فورية وتجربة تسوق أسرع
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {settings.androidAppUrl && (
                  <a
                    href={settings.androidAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                  >
                    <span>🤖</span> Android APK / Store
                  </a>
                )}

                {settings.iosAppUrl && (
                  <a
                    href={settings.iosAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                  >
                    <span>🍎</span> Apple App Store
                  </a>
                )}

                {settings.appDownloadUrl && !settings.androidAppUrl && !settings.iosAppUrl && (
                  <a
                    href={settings.appDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                  >
                    <span>📲</span> تحميل التطبيق المباشر
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-xl"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
