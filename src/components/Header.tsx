"use client";

import { useSettings } from "@/lib/settings-context";
import NotificationsBell from "@/components/NotificationsBell";
import GlobalSearch from "@/components/GlobalSearch";

const ROLE_LABELS = {
  manager: "مدير النظام",
  admin: "إداري",
  customer: "زبون",
};

export default function Header() {
  const { settings, toggleDarkMode } = useSettings();
  const currentRole = settings?.currentRole || "manager";
  const theme = settings?.roleThemes?.[currentRole] || { primary: "#1e40af", secondary: "#7c3aed", accent: "#f59e0b" };
  const roleLabel = ROLE_LABELS[currentRole] || "مدير النظام";

  return (
    <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-4 sm:px-6 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {settings.homeIcon ? (
            <img src={settings.homeIcon} alt="القائمة" style={{ width: settings.homeIconSize || 28, height: settings.homeIconSize || 28 }} className="object-contain" />
          ) : (
            <span style={{ fontSize: (settings.homeIconSize || 28) * 0.8 }}>🏠</span>
          )}
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white hidden sm:block">
            لوحة التحكم الرئيسية
          </h2>
        </div>

        <span
          className="px-3 py-1 rounded-full text-xs font-bold text-white hidden sm:inline"
          style={{ backgroundColor: theme.primary }}
        >
          {roleLabel}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <GlobalSearch />
        <NotificationsBell />
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xl"
          title={settings.darkMode ? "الوضع المضيء" : "الوضع المظلم"}
        >
          {settings.darkMode ? "☀️" : "🌙"}
        </button>

        {settings.logo ? (
          <img src={settings.logo} alt="الشعار" className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700" />
        ) : (
          <img src="/logo.jpg" alt="شعار" className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700" />
        )}
      </div>
    </header>
  );
}
