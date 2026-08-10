"use client";

import { useState } from "react";
import { useSettings } from "@/lib/settings-context";
import NotificationsBell from "@/components/NotificationsBell";
import GlobalSearch from "@/components/GlobalSearch";
import ContactLocationModal from "@/components/ContactLocationModal";
import ShareModal from "@/components/ShareModal";

const ROLE_LABELS = {
  manager: "مدير النظام",
  admin: "إداري",
  customer: "زبون",
};

export default function Header() {
  const { settings, toggleDarkMode, toggleEyeProtection } = useSettings();
  const currentRole = settings?.currentRole || "manager";
  const theme = settings?.roleThemes?.[currentRole] || { primary: "#1e40af", secondary: "#7c3aed", accent: "#f59e0b" };
  const roleLabel = ROLE_LABELS[currentRole] || "مدير النظام";

  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  return (
    <>
      <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-4 sm:px-6 transition-colors shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {settings.homeIcon ? (
              <img src={settings.homeIcon} alt="القائمة" style={{ width: settings.homeIconSize || 28, height: settings.homeIconSize || 28 }} className="object-contain" />
            ) : (
              <span style={{ fontSize: (settings.homeIconSize || 28) * 0.8 }}>🏠</span>
            )}
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white hidden sm:block">
              {settings.siteName || "لوحة التحكم الرئيسية"}
            </h2>
          </div>

          <span
            className="px-3 py-1 rounded-full text-xs font-bold text-white hidden md:inline"
            style={{ backgroundColor: theme.primary }}
          >
            {roleLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Location & Contact Button */}
          <button
            onClick={() => setIsContactModalOpen(true)}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition-all border border-blue-200 dark:border-blue-800 flex items-center gap-1.5"
            title="موقع المعرض والاتصال بنا"
          >
            <span>📍</span>
            <span className="hidden sm:inline">موقعنا والتواصل</span>
          </button>

          {/* Smart Share Button */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-bold transition-all border border-purple-200 dark:border-purple-800 flex items-center gap-1.5"
            title="مشاركة المتجر وتطبيق الهاتف"
          >
            <span>🔗</span>
            <span className="hidden sm:inline">مشاركة</span>
          </button>

          <GlobalSearch />
          <NotificationsBell />

          {/* Light / Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xl"
            title={settings.darkMode ? "التحويل للوضع النهاري (الفاتح)" : "التحويل للوضع المظلم (الليلي)"}
          >
            {settings.darkMode ? "☀️" : "🌙"}
          </button>

          {/* Eye Protection Sepia Toggle */}
          <button
            onClick={toggleEyeProtection}
            className={`p-2 rounded-xl transition-all text-xl flex items-center justify-center ${
              settings.eyeProtection
                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400"
                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            }`}
            title={settings.eyeProtection ? "إيقاف وضع حماية العين" : "تفعيل وضع حماية العين (Warm Sepia)"}
          >
            👁️
          </button>

          {settings.logo ? (
            <img src={settings.logo} alt="الشعار" className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700" />
          ) : (
            <img src="/logo.jpg" alt="شعار" className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700" />
          )}
        </div>
      </header>

      {/* Global Interactive Modals */}
      <ContactLocationModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />
    </>
  );
}
