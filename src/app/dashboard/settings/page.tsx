"use client";

import { useSettings } from "@/lib/settings-context";
import ColorPicker from "@/components/ColorPicker";
import ImageUploader from "@/components/ImageUploader";
import { UserRole } from "@/lib/types";

const FONT_OPTIONS = [
  { label: "Cairo", value: "Cairo" },
  { label: "Tajawal", value: "Tajawal" },
  { label: "Almarai", value: "Almarai" },
  { label: "IBM Plex Sans Arabic", value: "IBM Plex Sans Arabic" },
  { label: "Noto Sans Arabic", value: "Noto Sans Arabic" },
  { label: "Cairo (نظام)", value: "Arial, sans-serif" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "مدير النظام",
  admin: "إداري",
  customer: "زبون",
};

const ROLE_COLORS: Record<UserRole, { bg: string; border: string }> = {
  manager: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
  admin: { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
  customer: { bg: "bg-pink-50 dark:bg-pink-900/20", border: "border-pink-200 dark:border-pink-800" },
};

export default function SettingsPage() {
  const { settings, updateSettings, updateRoleTheme } = useSettings();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الإعدادات</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">تخصيص المظهر والإعدادات العامة للموقع</p>
      </div>

      {/* === Section 1: Branding === */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🎨</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">الشعار والصور</h2>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
            اسم الموقع
          </label>
          <input
            type="text"
            value={settings.siteName}
            onChange={(e) => updateSettings({ siteName: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ImageUploader
            label="الشعار (Logo)"
            image={settings.logo}
            onUpload={(img) => updateSettings({ logo: img })}
            aspect="aspect-square"
          />
          <ImageUploader
            label="صورة الواجهة (Hero)"
            image={settings.heroImage}
            onUpload={(img) => updateSettings({ heroImage: img })}
          />
          <ImageUploader
            label="صورة التذييل (Footer)"
            image={settings.footerImage}
            onUpload={(img) => updateSettings({ footerImage: img })}
          />
        </div>
      </section>

      {/* === Section 2: Appearance === */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">✏️</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">تخصيص المظهر</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              نوع الخط
            </label>
            <select
              value={settings.fontFamily}
              onChange={(e) => updateSettings({ fontFamily: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
              style={{ fontFamily: settings.fontFamily }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              حجم الخط: {settings.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>12px</span>
              <span>18px</span>
              <span>24px</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">معاينة الخط:</p>
          <p style={{ fontFamily: settings.fontFamily, fontSize: settings.fontSize }} className="text-gray-900 dark:text-white">
            هذا نص تجريبي لمعاينة حجم ونوع الخط المختار. موقع أحمد بحري - متجر إلكتروني ونظام ERP.
          </p>
        </div>
      </section>

      {/* === Section 3: Colors === */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🎯</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">الألوان العامة</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ColorPicker
            label="اللون الأساسي"
            color={settings.primaryColor}
            onChange={(c) => updateSettings({ primaryColor: c })}
          />
          <ColorPicker
            label="اللون الثانوي"
            color={settings.secondaryColor}
            onChange={(c) => updateSettings({ secondaryColor: c })}
          />
          <ColorPicker
            label="لون التمييز"
            color={settings.accentColor}
            onChange={(c) => updateSettings({ accentColor: c })}
          />
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">معاينة الألوان:</p>
          <div className="flex gap-3">
            <div className="w-16 h-16 rounded-lg shadow-inner" style={{ backgroundColor: settings.primaryColor }} />
            <div className="w-16 h-16 rounded-lg shadow-inner" style={{ backgroundColor: settings.secondaryColor }} />
            <div className="w-16 h-16 rounded-lg shadow-inner" style={{ backgroundColor: settings.accentColor }} />
          </div>
        </div>

        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">الوضع المظلم (Dark Mode)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">تبديل بين الوضع المضيء والمظلم</p>
          </div>
          <button
            onClick={() => updateSettings({ darkMode: !settings.darkMode })}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.darkMode ? "bg-[var(--primary)]" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-xs ${
                settings.darkMode ? "right-0.5" : "right-7"
              }`}
            >
              {settings.darkMode ? "🌙" : "☀️"}
            </div>
          </button>
        </div>
      </section>

      {/* === Section 4: Role Themes === */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">👤</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">تمييز الأدوار بالألوان</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mr-2">
            تخصيص ألوان مميزة لكل دور يظهر عند الدخول
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["manager", "admin", "customer"] as UserRole[]).map((role) => {
            const colors = ROLE_COLORS[role];
            return (
              <div
                key={role}
                className={`rounded-xl border-2 p-5 space-y-4 ${colors.bg} ${colors.border}`}
              >
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: settings.roleThemes[role].primary }}
                  />
                  {ROLE_LABELS[role]}
                </h3>

                <ColorPicker
                  label="الأساسي"
                  color={settings.roleThemes[role].primary}
                  onChange={(c) => updateRoleTheme(role, { primary: c })}
                />
                <ColorPicker
                  label="الثانوي"
                  color={settings.roleThemes[role].secondary}
                  onChange={(c) => updateRoleTheme(role, { secondary: c })}
                />
                <ColorPicker
                  label="التمييز"
                  color={settings.roleThemes[role].accent}
                  onChange={(c) => updateRoleTheme(role, { accent: c })}
                />

                <div className="flex gap-2 pt-2">
                  <div
                    className="flex-1 h-8 rounded-lg"
                    style={{ backgroundColor: settings.roleThemes[role].primary }}
                  />
                  <div
                    className="flex-1 h-8 rounded-lg"
                    style={{ backgroundColor: settings.roleThemes[role].secondary }}
                  />
                  <div
                    className="flex-1 h-8 rounded-lg"
                    style={{ backgroundColor: settings.roleThemes[role].accent }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Save indicator */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 pb-4">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>جميع التغييرات تُحفظ تلقائياً</span>
      </div>
    </div>
  );
}
