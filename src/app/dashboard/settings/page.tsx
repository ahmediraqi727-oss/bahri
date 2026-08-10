"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import ColorPicker from "@/components/ColorPicker";
import ImageUploader from "@/components/ImageUploader";
import CategoriesManager from "@/components/CategoriesManager";
import WatermarkSettings from "@/components/WatermarkSettings";
import ThemeCustomizer from "@/components/ThemeCustomizer";
import ProfileEditModal from "@/components/ProfileEditModal";
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
  const { user, loading: authLoading } = useAuth();
  const [profileModalOpen, setProfileModalOpen] = useState(false);

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

  // 🔒 Route Protection: If user is a Customer or Guest, block access to System Settings (403 Unauthorized)
  if (!authLoading && user && (user.role === "customer" || user.isGuest || user.id.startsWith("guest-"))) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 border border-red-200 dark:border-red-900/60 shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/80 rounded-2xl border border-red-300 dark:border-red-800 flex items-center justify-center text-3xl mx-auto shadow-sm">
            ⛔
          </div>

          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white">
            غير مصرح لك بدخول هذه الصفحة (403 Access Denied)
          </h2>

          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            صفحة إعدادات الهوية والبنية التحتية للمتجر مخصصة حصراً لمدراء النظام والإداريين. بصفتك زبون، يمكنك تعديل معلومات ملفك الشخصي بكل سهولة.
          </p>

          <div className="pt-3 space-y-2">
            <button
              onClick={() => setProfileModalOpen(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>👤</span>
              <span>تعديل الملف الشخصي والمعلومات</span>
            </button>

            <Link
              href="/"
              className="w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm transition-colors block text-center"
            >
              العودة للمتجر الرئيسي 🏠
            </Link>
          </div>

          <ProfileEditModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
        </div>
      </div>
    );
  }

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

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateSettings(formData);
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "إعدادات الموقع",
        details: "حفظ وتحديث إعدادات الموقع، الصور، الثيمات والموقع الجغرافي بالكامل",
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: unknown) {
      console.error("[Settings Save Failure Details]:", err);
      const detailedMessage = err instanceof Error ? err.message : String(err);
      setErrorMsg(`تعذر حفظ الإعدادات في قاعدة البيانات: ${detailedMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(settings);
    setSavedSuccess(false);
    setErrorMsg(null);
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
    <div className="space-y-6 max-w-4xl w-full pb-28" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إعدادات النظام والشكل العام</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">تخصيص الهوية، الثيمات، الموقع الجغرافي، وسوشيال ميديا المتجر</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setProfileModalOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <span>👤</span>
            <span>تعديل الملف الشخصي والمعلومات الأمنيّة</span>
          </button>

          {isDirty && (
            <span className="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold rounded-full animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              توجد تغييرات غير محفوظة!
            </span>
          )}
        </div>
      </div>

      {/* Notifications Banners */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-sm font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <span>تم حفظ جميع التغييرات والإعدادات بنجاح وتطبيقها فوراً لجميع المستخدمين!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)} className="text-emerald-600 hover:text-emerald-800 text-xs">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-2xl flex items-center justify-between text-red-800 dark:text-red-300 text-sm font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-600 hover:text-red-800 text-xs font-bold">✕</button>
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

      {/* === Section 2: Advanced Theme Customizer === */}
      <ThemeCustomizer />

      {/* === Section 3: Store Location & Maps === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📍</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">إدارة الموقع الجغرافي وخريطة المعرض</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">تحديد عنوان الموقع ورابط خرائط Google Maps المعروض للزبائن في القائمة</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
              عنوان المعرض / المحل التفصيلي:
            </label>
            <input
              type="text"
              placeholder="مثال: العراق - بغداد - الشارع التجاري الرئيسي"
              value={formData.storeAddress || ""}
              onChange={(e) => handleChange({ storeAddress: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
              رابط الموقع المباشر في Google Maps:
            </label>
            <input
              type="text"
              placeholder="https://maps.google.com/..."
              value={formData.storeMapLink || ""}
              onChange={(e) => handleChange({ storeMapLink: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none"
            />
          </div>
        </div>
      </section>

      {/* === Section 4: Contact & Social Media Channels === */}
      {isManagerOrAdmin && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🌐</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">روابط الاتصال وصفحات السوشيال ميديا الرسمية</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">ربط قنوات الاتصال برقم ثانوي وصفحات الفيسبوك والانستغرام والتيك توك</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">💬 الواتساب الرئيسية:</label>
              <input
                type="text"
                placeholder="07800000000"
                value={formData.whatsappLink || ""}
                onChange={(e) => handleChange({ whatsappLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">📞 الهاتف الرئيسي:</label>
              <input
                type="text"
                placeholder="07800000000"
                value={formData.phoneLink || ""}
                onChange={(e) => handleChange({ phoneLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">☎️ الهاتف الثانوي:</label>
              <input
                type="text"
                placeholder="07700000000"
                value={formData.phoneLink2 || ""}
                onChange={(e) => handleChange({ phoneLink2: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">📘 صفحة Facebook:</label>
              <input
                type="text"
                placeholder="https://facebook.com/..."
                value={formData.facebookLink || ""}
                onChange={(e) => handleChange({ facebookLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">📸 حساب Instagram:</label>
              <input
                type="text"
                placeholder="https://instagram.com/..."
                value={formData.instagramLink || ""}
                onChange={(e) => handleChange({ instagramLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🎵 حساب TikTok:</label>
              <input
                type="text"
                placeholder="https://tiktok.com/@..."
                value={formData.tiktokLink || ""}
                onChange={(e) => handleChange({ tiktokLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>
          </div>
        </section>
      )}

      {/* === Section 5: Mobile App Share Download Links === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📲</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">إعدادات رابط مشاركة وتطبيقات الهاتف الذكي</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">تخصيص روابط التحميل المباشر لتطبيق Android و iOS المعروضة عند استخدام زر المشاركة</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🤖 رابط تطبيق Android (APK / Play Store):</label>
            <input
              type="text"
              placeholder="https://play.google.com/..."
              value={formData.androidAppUrl || ""}
              onChange={(e) => handleChange({ androidAppUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🍎 رابط تطبيق iOS (App Store):</label>
            <input
              type="text"
              placeholder="https://apps.apple.com/..."
              value={formData.iosAppUrl || ""}
              onChange={(e) => handleChange({ iosAppUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🔗 رابط تحميل عام المباشر:</label>
            <input
              type="text"
              placeholder="https://example.com/app.apk"
              value={formData.appDownloadUrl || ""}
              onChange={(e) => handleChange({ appDownloadUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
            />
          </div>
        </div>
      </section>

      {/* === Section 6: Categories Management === */}
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

      {/* === Section 7: Automated Watermark Tool === */}
      <WatermarkSettings />

      {/* === Section 8: Appearance & Fonts === */}
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

      {/* === Section 9: Colors & Dark Mode === */}
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
            <p className="text-xs text-gray-500 dark:text-gray-400">تبديل ثيم المظهر بين المضيء (النهاري) والمظلم (الليلي)</p>
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

        {/* Eye Protection Toggle */}
        <div className="flex items-center justify-between p-4 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
          <div>
            <h3 className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <span>👁️</span>
              <span>وضع حماية العين (Eye Protection / Warm Sepia Filter)</span>
            </h3>
            <p className="text-xs text-amber-700/80 dark:text-amber-400">
              مرشح إضاءة دافئ مريح للعين يقلل الإشعاع الأزرق مع إمكانية الدمج مع الوضع الليلي أو النهاري
            </p>
          </div>
          <button
            onClick={() => handleChange({ eyeProtection: !formData.eyeProtection })}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              formData.eyeProtection ? "bg-amber-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-xs ${
                formData.eyeProtection ? "right-0.5" : "right-7"
              }`}
            >
              {formData.eyeProtection ? "👁️" : "⚪"}
            </div>
          </button>
        </div>
      </section>

      {/* === Section 10: Delivery Settings === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🚚</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">إعدادات التوصيل والشحن الافتراضية</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
              تكلفة التوصيل الافتراضية (د.ع)
            </label>
            <input
              type="number"
              value={formData.defaultDeliveryFee ?? 5000}
              onChange={(e) => handleChange({ defaultDeliveryFee: Number(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="5000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
              مدة التوصيل المتوقعة
            </label>
            <input
              type="text"
              value={formData.defaultDeliveryDuration ?? "2 - 3 أيام عمل"}
              onChange={(e) => handleChange({ defaultDeliveryDuration: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="مثال: 2 - 3 أيام عمل / توصيل سريع"
            />
          </div>
        </div>
      </section>

      {/* === Section 11: Role Themes === */}
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

      {/* === Sticky Action Bar at Bottom of Screen === */}
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

      {/* Profile Edit Modal */}
      <ProfileEditModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </div>
  );
}
