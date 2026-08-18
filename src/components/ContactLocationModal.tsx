"use client";

import { useSettings } from "@/lib/settings-context";

interface ContactLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "contact" | "location";
}

export default function ContactLocationModal({
  isOpen,
  onClose,
  defaultTab = "contact",
}: ContactLocationModalProps) {
  const { settings } = useSettings();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-lg overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors"
          >
            ✕
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">
              📍
            </div>
            <div>
              <h3 className="text-lg font-extrabold">{settings.siteName || "موقع أحمد بحري"}</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                تواصل معنا مباشرة أو تضل بزيارة موقعنا الجغرافي المعروض
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Location Section */}
          <div className="space-y-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <span>🗺️</span>
              <span>موقع المعرض / المحل الجغرافي:</span>
            </h4>
            <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
              {settings.storeAddress || "العراق - بغداد - الشارع التجاري الرئيسي"}
            </p>

            {settings.storeMapLink && (
              <a
                href={settings.storeMapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all mt-1"
              >
                <span>📍</span>
                <span>فتح الموقع في خرائط Google Maps</span>
              </a>
            )}
          </div>

          {/* Direct Communication Channels */}
          {(() => {
            const hasPhone = Boolean(settings.phoneLink && settings.phoneLink.trim() !== "");
            const hasPhone2 = Boolean(settings.phoneLink2 && settings.phoneLink2.trim() !== "");
            const hasWhatsapp = Boolean(settings.whatsappLink && settings.whatsappLink.trim() !== "");
            const hasTelegram = Boolean(settings.telegramLink && settings.telegramLink.trim() !== "");

            if (!hasPhone && !hasPhone2 && !hasWhatsapp && !hasTelegram) return null;

            return (
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📞</span>
                  <span>قنوات الاتصال والدعم الفوري:</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Primary Phone Call */}
                  {hasPhone && (
                    <a
                      href={`tel:${settings.phoneLink}`}
                      className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 border border-purple-200 dark:border-purple-800 rounded-xl text-purple-900 dark:text-purple-200 text-xs font-bold transition-all shadow-xs"
                    >
                      <span className="text-xl">📞</span>
                      <div>
                        <div className="text-[10px] text-purple-600 dark:text-purple-400">اتصال مباشر (رئيسي)</div>
                        <div>{settings.phoneLink}</div>
                      </div>
                    </a>
                  )}

                  {/* Second Phone Call */}
                  {hasPhone2 && (
                    <a
                      href={`tel:${settings.phoneLink2}`}
                      className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 rounded-xl text-indigo-900 dark:text-indigo-200 text-xs font-bold transition-all shadow-xs"
                    >
                      <span className="text-xl">☎️</span>
                      <div>
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400">رقم ثانوي</div>
                        <div>{settings.phoneLink2}</div>
                      </div>
                    </a>
                  )}

                  {/* WhatsApp */}
                  {hasWhatsapp && (
                    <a
                      href={
                        settings.whatsappLink!.startsWith("http")
                          ? settings.whatsappLink!
                          : `https://wa.me/${settings.whatsappLink!.replace(/[^0-9]/g, "")}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs font-bold transition-all shadow-xs"
                    >
                      <span className="text-xl">💬</span>
                      <div>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400">مراسلة WhatsApp</div>
                        <div>{settings.whatsappLink}</div>
                      </div>
                    </a>
                  )}

                  {/* Telegram */}
                  {hasTelegram && (
                    <a
                      href={
                        settings.telegramLink!.startsWith("http")
                          ? settings.telegramLink!
                          : `https://t.me/${settings.telegramLink!.replace("@", "")}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 border border-sky-200 dark:border-sky-800 rounded-xl text-sky-900 dark:text-sky-200 text-xs font-bold transition-all shadow-xs"
                    >
                      <span className="text-xl">✈️</span>
                      <div>
                        <div className="text-[10px] text-sky-600 dark:text-sky-400">قناة Telegram</div>
                        <div>{settings.telegramLink}</div>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Social Media Channels */}
          {(() => {
            const hasFacebook = Boolean(settings.facebookLink && settings.facebookLink.trim() !== "");
            const hasInstagram = Boolean(settings.instagramLink && settings.instagramLink.trim() !== "");
            const hasTiktok = Boolean(settings.tiktokLink && settings.tiktokLink.trim() !== "");
            const hasYoutube = Boolean(settings.youtubeLink && settings.youtubeLink.trim() !== "");

            if (!hasFacebook && !hasInstagram && !hasTiktok && !hasYoutube) return null;

            return (
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <h4 className="text-xs font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>🌐</span>
                  <span>صفحاتنا الرسمية على مواقع التواصل الاجتماعي:</span>
                </h4>

                <div className="flex flex-wrap items-center gap-2">
                  {hasFacebook && (
                    <a
                      href={settings.facebookLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>📘</span> Facebook
                    </a>
                  )}

                  {hasInstagram && (
                    <a
                      href={settings.instagramLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>📸</span> Instagram
                    </a>
                  )}

                  {hasTiktok && (
                    <a
                      href={settings.tiktokLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>🎵</span> TikTok
                    </a>
                  )}

                  {hasYoutube && (
                    <a
                      href={settings.youtubeLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>▶️</span> YouTube
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-xl transition-all"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
