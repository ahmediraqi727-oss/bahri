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
  const theme = settings.roleThemes[settings.currentRole];

  return (
    <header className="h-16 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white hidden sm:block">
          🏠 القائمة الرئيسية
        </h2>
        <span
          className="px-3 py-1 rounded-full text-xs font-medium text-white hidden sm:inline"
          style={{ backgroundColor: theme.primary }}
        >
          {ROLE_LABELS[settings.currentRole]}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <GlobalSearch />
        <NotificationsBell />
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xl"
          title={settings.darkMode ? "الوضع المضيء" : "الوضع المظلم"}
        >
          {settings.darkMode ? "☀️" : "🌙"}
        </button>
        <img src="/logo.jpg" alt="شعار" className="w-8 h-8 rounded-full object-cover shadow-sm" />
      </div>
    </header>
  );
}
