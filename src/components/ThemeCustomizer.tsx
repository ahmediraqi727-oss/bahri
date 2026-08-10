"use client";

import { useState } from "react";
import { useSettings } from "@/lib/settings-context";
import { useToast } from "@/components/ToastProvider";
import { ThemePreset, PRESET_THEMES } from "@/lib/types";
import ColorPicker from "./ColorPicker";

export default function ThemeCustomizer() {
  const { settings, updateSettings } = useSettings();
  const { success, error: toastError, info } = useToast();

  const [activePreset, setActivePreset] = useState<string>(settings.activeThemePreset || "classic-blue");
  const [customThemes, setCustomThemes] = useState<ThemePreset[]>(settings.customThemes || []);

  const [newThemeName, setNewThemeName] = useState("");
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor || "#2563eb");
  const [secondaryColor, setSecondaryColor] = useState(settings.secondaryColor || "#7c3aed");
  const [accentColor, setAccentColor] = useState(settings.accentColor || "#f59e0b");

  const [isSaving, setIsSaving] = useState(false);

  // Combine built-in presets with manager's custom themes
  const allThemes: ThemePreset[] = [...PRESET_THEMES, ...customThemes];

  // ── Apply Selected Theme Preset ─────────────────────────────────────────
  const handleSelectPreset = async (preset: ThemePreset) => {
    setActivePreset(preset.id);
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
    setAccentColor(preset.accent);

    try {
      await updateSettings({
        primaryColor: preset.primary,
        secondaryColor: preset.secondary,
        accentColor: preset.accent,
        activeThemePreset: preset.id,
      });
      success(`تم تفعيل الثيم "${preset.name}" بنجاح!`);
    } catch (err: any) {
      toastError("فشل تفعيل الثيم", err?.message || "حدث خطأ غير متوقع");
    }
  };

  // ── Create & Save New Custom Theme ──────────────────────────────────────
  const handleCreateCustomTheme = async () => {
    if (!newThemeName.trim()) {
      toastError("خطأ", "يرجى كتابة اسم للثيم الجديد");
      return;
    }

    const newTheme: ThemePreset = {
      id: `custom_${Date.now()}`,
      name: newThemeName.trim(),
      primary: primaryColor,
      secondary: secondaryColor,
      accent: accentColor,
      description: "ثيم مخصص تم إنشاؤه بواسطة المدير",
      isBuiltIn: false,
    };

    const updatedCustom = [...customThemes, newTheme];
    setCustomThemes(updatedCustom);
    setNewThemeName("");

    try {
      await updateSettings({
        customThemes: updatedCustom,
        primaryColor,
        secondaryColor,
        accentColor,
        activeThemePreset: newTheme.id,
      });
      setActivePreset(newTheme.id);
      success("تم إنشاء وحفظ الثيم المخصص بنجاح!");
    } catch (err: any) {
      toastError("فشل الحفظ", err?.message || "حدث خطأ أثناء حفظ الثيم");
    }
  };

  // ── Delete Custom Theme ──────────────────────────────────────────────────
  const handleDeleteCustomTheme = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("هل أنت متأكد من حذف هذا الثيم المخصص؟")) return;

    const updatedCustom = customThemes.filter((t) => t.id !== id);
    setCustomThemes(updatedCustom);

    try {
      await updateSettings({ customThemes: updatedCustom });
      info("تم حذف الثيم المخصص.");
    } catch (err: any) {
      toastError("فشل الحذف", err?.message);
    }
  };

  // ── Export Theme JSON Config ─────────────────────────────────────────────
  const handleExportThemeJSON = () => {
    const activeObj = allThemes.find((t) => t.id === activePreset) || {
      name: "Custom Active Theme",
      primary: primaryColor,
      secondary: secondaryColor,
      accent: accentColor,
    };

    const blob = new Blob([JSON.stringify(activeObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `theme_${activePreset}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    success("تم تصدير ملف الثيم بنجاح!");
  };

  // ── Reset to Default Built-in Theme ─────────────────────────────────────
  const handleResetDefault = async () => {
    const defaultTheme = PRESET_THEMES[0];
    await handleSelectPreset(defaultTheme);
  };

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 space-y-6 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 dark:border-gray-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white text-2xl shadow-md">
            🎨
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
              نظام إدارة الثيمات المتقدم (Advanced Theme Customizer)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              تخصيص ثيمات الألوان الجاهزة، إنشاء ثيمات مخصصة، استيراد/تصدير إعدادات الثيمات
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetDefault}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl transition-all"
        >
          🔄 إعادة الضبط للافتراضي
        </button>
      </div>

      {/* Built-in & Custom Presets Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
          <span>✨</span>
          <span>اختر من الثيمات الجاهزة والمخصصة</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allThemes.map((preset) => (
            <div
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`relative p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                activePreset === preset.id
                  ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 shadow-md scale-[1.02]"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/40"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate max-w-[170px]">
                  {preset.name}
                </h4>
                {activePreset === preset.id && (
                  <span className="text-[10px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                    مَفْعَل ✅
                  </span>
                )}
              </div>

              <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 mb-3">
                {preset.description}
              </p>

              {/* Swatch Colors preview */}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: preset.primary }} title="الأساسي" />
                <div className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: preset.secondary }} title="الثانوي" />
                <div className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: preset.accent }} title="التمييز" />

                {!preset.isBuiltIn && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteCustomTheme(preset.id, e)}
                    className="mr-auto text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 bg-red-50 dark:bg-red-950/40 rounded-lg"
                    title="حذف الثيم المخصص"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Color Adjuster & New Theme Creator */}
      <div className="p-5 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-5">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
          <span>🛠️</span>
          <span>تخصيص الألوان يدوياً وإنشاء ثيم جديد</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ColorPicker label="اللون الأساسي (Primary)" color={primaryColor} onChange={setPrimaryColor} />
          <ColorPicker label="اللون الثانوي (Secondary)" color={secondaryColor} onChange={setSecondaryColor} />
          <ColorPicker label="لون التمييز (Accent)" color={accentColor} onChange={setAccentColor} />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <input
            type="text"
            placeholder="اسم الثيم المخصص الجديد..."
            value={newThemeName}
            onChange={(e) => setNewThemeName(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
          />

          <button
            type="button"
            onClick={handleCreateCustomTheme}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <span>➕</span>
            <span>حفظ كـ ثيم مخصص جديد</span>
          </button>

          <button
            type="button"
            onClick={handleExportThemeJSON}
            className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-xl transition-all flex items-center gap-2"
          >
            <span>📤</span>
            <span>تصدير الثيم الحالي (JSON)</span>
          </button>
        </div>
      </div>
    </section>
  );
}
