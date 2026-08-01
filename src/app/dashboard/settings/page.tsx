"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import ColorPicker from "@/components/ColorPicker";
import ImageUploader from "@/components/ImageUploader";
import CategoriesManager from "@/components/CategoriesManager";
import { SiteSettings, UserRole } from "@/lib/types";

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
  const { settings, updateSettings, loading } = useSettings();
  const { logActivity } = useActivityLog();

  // Local draft state for explicit Save / Cancel controls
  const [formData, setFormData] = useState<SiteSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync draft state when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleChange = (fields: Partial<SiteSettings>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
    setSavedSuccess(false);
  };

  const handleRoleThemeChange = (role: UserRole, themeUpdates: Partial<SiteSettings["roleThemes"][UserRole]>) => {
    setFormData((prev) => ({
      ...prev,
      roleThemes: {
        ...prev.roleThemes,
        [role]: {
          ...prev.roleThemes[role],
          ...themeUpdates,
        },
      },
    }));
    setSavedSuccess(false);
  };

  // Check if form has unsaved changes
  const isDirty = JSON.stringify(formData) !== JSON.stringify(settings);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(formData);
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "إعدادات الموقع",
        details: "حفظ وتحديث إعدادات الموقع، الصور، الأيقونات والتذييل بالكامل",
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      alert("حدث خطأ أثناء حفظ الإعدادات!");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(settings);
    setSavedSuccess(false);
  };

  const isManagerOrAdmin = settings.currentRole === "manager" || settings.currentRole === "admin";

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 dark:text-gray-400">
        <span className="text-3xl animate-spin block mb-2">🔄</span>
        <p>جاري تحميل الإعدادات...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-28" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إعدادات النظام والشكل العام</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">تخصيص الهوية، الأيقونات والأحجام، تذييل الصفحة، وروابط التواصل</p>
        </div>

        {isDirty && (
          <span className="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold rounded-full animate-pulse flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            توجد تغييرات غير محفوظة!
          </span>
        )}
      </div>

      {/* Success Notification Banner */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-sm font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <span>تم حفظ جميع التغييرات والإعدادات بنجاح وتطبيقها فوراً لجميع المستخدمين!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)} className="text-emerald-600 hover:text-emerald-800 text-xs">✕</button>
        </div>
      )}

      {/* === Section 1: Branding Images === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🖼️</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">الشعار وصور الهوية البصرية</h2>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">
            اسم الموقع والمتجر
          </label>
          <input
            type="text"
            value={formData.siteName}
            onChange={(e) => handleChange({ siteName: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ImageUploader
            label="الشعار الرسمي (Logo)"
            image={formData.logo}
            onUpload={(img) => handleChange({ logo: img })}
            aspect="aspect-square"
          />
          <ImageUploader
            label="صورة الواجهة (Hero Header)"
            image={formData.heroImage}
            onUpload={(img) => handleChange({ heroImage: img })}
          />
          <ImageUploader
            label="صورة تذييل الصفحة (Footer Image)"
            image={formData.footerImage}
            onUpload={(img) => handleChange({ footerImage: img })}
          />
        </div>
      </section>

      {/* === Section 1.8: Custom Header Icons & Sizing (أيقونات الواجهة وأحجامها) === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">⚙️</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">تخصيص أيقونات الواجهة وأحجامها</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">تغيير صور وأيقونات القائمة، البحث، وسلة المشتريات والتحكم بأحجامها</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Menu / Home Icon */}
          <div className="space-y-3 bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <ImageUploader
              label="أيقونة القائمة الرئيسية"
              image={formData.homeIcon || ""}
              onUpload={(img) => handleChange({ homeIcon: img })}
              aspect="aspect-square"
            />
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                حجم الأيقونة: {formData.homeIconSize || 28}px
              </label>
              <input
                type="range"
                min="16"
                max="64"
                value={formData.homeIconSize || 28}
                onChange={(e) => handleChange({ homeIconSize: Number(e.target.value) })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          {/* Search Icon */}
          <div className="space-y-3 bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <ImageUploader
              label="أيقونة البحث"
              image={formData.searchIcon || ""}
              onUpload={(img) => handleChange({ searchIcon: img })}
              aspect="aspect-square"
            />
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                حجم الأيقونة: {formData.searchIconSize || 28}px
              </label>
              <input
                type="range"
                min="16"
                max="64"
                value={formData.searchIconSize || 28}
                onChange={(e) => handleChange({ searchIconSize: Number(e.target.value) })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          {/* Cart Icon */}
          <div className="space-y-3 bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <ImageUploader
              label="أيقونة السلة"
              image={formData.cartIcon || ""}
              onUpload={(img) => handleChange({ cartIcon: img })}
              aspect="aspect-square"
            />
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                حجم الأيقونة: {formData.cartIconSize || 28}px
              </label>
              <input
                type="range"
                min="16"
                max="64"
                value={formData.cartIconSize || 28}
                onChange={(e) => handleChange({ cartIconSize: Number(e.target.value) })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>
        </div>
      </section>

      {/* === Section 1.85: Categories Management (إدارة وتخصيص الأقسام) === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📁</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">إدارة وتخصيص أقسام المنتجات</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">إضافة صور وأسماء الأقسام، ترتيب أولوية الظهور، وتفعيل/تعطيل الشريط المتحرك</p>
          </div>
        </div>
        <CategoriesManager />
      </section>

      {/* === Section 1.9: Footer Customization (تخصيص تذييل الصفحة) === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📐</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">التحكم الكامل بتذييل الصفحة (Footer)</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">تعديل ارتفاع التذييل والنصوص الثلاثة المعروضة في الأسفل</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
            ارتفاع تذييل الصفحة (Height / Vertical Padding): {formData.footerHeight || 120}px
          </label>
          <input
            type="range"
            min="60"
            max="300"
            step="10"
            value={formData.footerHeight || 120}
            onChange={(e) => handleChange({ footerHeight: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              ➡️ نص جهة اليمين بالتذييل:
            </label>
            <input
              type="text"
              placeholder="مثال: جميع الحقوق محفوظة © 2026"
              value={formData.footerRightText || ""}
              onChange={(e) => handleChange({ footerRightText: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              ⏺️ نص الوسط بالتذييل:
            </label>
            <input
              type="text"
              placeholder="مثال: أفضل المنتجات لخدمتكم"
              value={formData.footerCenterText || ""}
              onChange={(e) => handleChange({ footerCenterText: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              ⬅️ نص جهة اليسار بالتذييل:
            </label>
            <input
              type="text"
              placeholder="مثال: للطلب: 07800000000"
              value={formData.footerLeftText || ""}
              onChange={(e) => handleChange({ footerLeftText: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none"
            />
          </div>
        </div>
      </section>

      {/* === Section 1.5: Contact Links (روابط الاتصال والتواصل) === */}
      {isManagerOrAdmin && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">📞</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">روابط الاتصال والتواصل للإدارة</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">تُستخدم هذه الروابط في نافذة الطلب المباشر للزبائن للتواصل معكم</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5 flex items-center gap-2">
                <span>💬</span> رابط / رقم الواتساب (WhatsApp)
              </label>
              <input
                type="text"
                placeholder="مثال: 07800000000 أو 9647800000000"
                value={formData.whatsappLink || ""}
                onChange={(e) => handleChange({ whatsappLink: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5 flex items-center gap-2">
                <span>✈️</span> رابط / يوزر التليكرام (Telegram)
              </label>
              <input
                type="text"
                placeholder="مثال: https://t.me/username أو @username"
                value={formData.telegramLink || ""}
                onChange={(e) => handleChange({ telegramLink: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5 flex items-center gap-2">
                <span>⚡</span> رابط الماسنجر (Messenger)
              </label>
              <input
                type="text"
                placeholder="مثال: https://m.me/page_name أو اسم الصفحة"
                value={formData.messengerLink || ""}
                onChange={(e) => handleChange({ messengerLink: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1.5 flex items-center gap-2">
                <span>📞</span> رقم الاتصال المباشر (Phone Call)
              </label>
              <input
                type="text"
                placeholder="مثال: 07800000000"
                value={formData.phoneLink || ""}
                onChange={(e) => handleChange({ phoneLink: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
              />
            </div>
          </div>
        </section>
      )}

      {/* === Section 2: Appearance & Fonts === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">✏️</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">تخصيص المظهر والخطوط</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
              نوع الخط
            </label>
            <select
              value={formData.fontFamily}
              onChange={(e) => handleChange({ fontFamily: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              style={{ fontFamily: formData.fontFamily }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
              حجم الخط الأساسي: {formData.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={formData.fontSize}
              onChange={(e) => handleChange({ fontSize: Number(e.target.value) })}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>12px</span>
              <span>18px</span>
              <span>24px</span>
            </div>
          </div>
        </div>
      </section>

      {/* === Section 3: Colors & Dark Mode === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🎯</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">الألوان العامة والوضع المظلم</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ColorPicker
            label="اللون الأساسي"
            color={formData.primaryColor}
            onChange={(c) => handleChange({ primaryColor: c })}
          />
          <ColorPicker
            label="اللون الثانوي"
            color={formData.secondaryColor}
            onChange={(c) => handleChange({ secondaryColor: c })}
          />
          <ColorPicker
            label="لون التمييز"
            color={formData.accentColor}
            onChange={(c) => handleChange({ accentColor: c })}
          />
        </div>

        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">الوضع المظلم (Dark Mode)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">تبديل ثيم المظهر بين المضيء والمظلم</p>
          </div>
          <button
            onClick={() => handleChange({ darkMode: !formData.darkMode })}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              formData.darkMode ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-xs ${
                formData.darkMode ? "right-0.5" : "right-7"
              }`}
            >
              {formData.darkMode ? "🌙" : "☀️"}
            </div>
          </button>
        </div>
      </section>

      {/* === Section 4: Role Themes === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">👤</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">تخصيص ثيمات الأدوار</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["manager", "admin", "customer"] as UserRole[]).map((role) => {
            const colors = ROLE_COLORS[role];
            const currentRoleTheme = formData.roleThemes[role];
            return (
              <div
                key={role}
                className={`rounded-2xl border-2 p-5 space-y-4 ${colors.bg} ${colors.border}`}
              >
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                  <div
                    className="w-3.5 h-3.5 rounded-full shadow-sm"
                    style={{ backgroundColor: currentRoleTheme.primary }}
                  />
                  {ROLE_LABELS[role]}
                </h3>

                <ColorPicker
                  label="الأساسي"
                  color={currentRoleTheme.primary}
                  onChange={(c) => handleRoleThemeChange(role, { primary: c })}
                />
                <ColorPicker
                  label="الثانوي"
                  color={currentRoleTheme.secondary}
                  onChange={(c) => handleRoleThemeChange(role, { secondary: c })}
                />
                <ColorPicker
                  label="التمييز"
                  color={currentRoleTheme.accent}
                  onChange={(c) => handleRoleThemeChange(role, { accent: c })}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* === Sticky Action Bar at Bottom of Screen (أزرار الحفظ والإلغاء) === */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-4 z-40 shadow-2xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4" dir="rtl">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
            {isDirty ? (
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                ⚠️ لديك تغييرات غير محفوظة
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                جميع الإعدادات مطابقة لآخر حفظ
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              disabled={!isDirty || saving}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              إلغاء التعديلات ❌
            </button>

            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg disabled:opacity-40 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              {saving ? (
                <>
                  <span className="animate-spin text-base">🔄</span>
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <span>حفظ التغييرات 💾</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
