"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import ImageUploader from "@/components/ImageUploader";
import { supabase } from "@/lib/supabase-client";
import {
  FooterSettings,
  DEFAULT_FOOTER_SETTINGS,
  rowToFooterSettings,
  footerSettingsToRow,
} from "@/lib/footer-types";

export default function FooterSettingsManager() {
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(DEFAULT_FOOTER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"zones" | "fullWidth" | "dimensions">("zones");

  // Load footer settings from database
  useEffect(() => {
    async function loadFooter() {
      try {
        const { data, error } = await supabase
          .from("footer_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle();

        if (data && !error) {
          setFooterSettings(rowToFooterSettings(data));
        }
      } catch (err) {
        console.warn("Footer settings load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadFooter();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const rowData = footerSettingsToRow(footerSettings);

      // الحفظ المباشر والآمن في جدول footer_settings فقط لمنع أي تعارض
      const { error } = await supabase
        .from("footer_settings")
        .upsert(rowData, { onConflict: "id" });

      if (error) {
        throw new Error(error.message);
      }

      setToastMessage("✅ تم حفظ إعدادات ذيل الصفحة الرئيسية بنجاح!");
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error("Error saving footer settings:", err);
      setToastMessage(`⚠️ حدث خطأ أثناء الحفظ: ${err.message || "يرجى المحاولة مرة أخرى"}`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 font-bold flex items-center justify-center gap-2">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span>جاري تحميل إعدادات ذيل الصفحة...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 text-white px-6 py-3 rounded-2xl shadow-2xl border border-emerald-500/40 text-xs sm:text-sm font-extrabold flex items-center gap-2 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-6 text-white shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">
            📐
          </div>
          <div>
            <h2 className="text-xl font-extrabold">إدارة ذيل الصفحة الرئيسية (Footer System)</h2>
            <p className="text-xs text-blue-100 mt-1">
              التحكم الكامل بأقسام وتخطيط وأبعاد ذيل الصفحة الرئيسية ووضع العرض الكامل بدون تداخل النصوص
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto px-6 py-3 bg-white text-blue-700 hover:bg-blue-50 font-extrabold text-xs sm:text-sm rounded-2xl shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
              <span>جاري الحفظ...</span>
            </>
          ) : (
            <>
              <span>💾</span>
              <span>حفظ التعديلات</span>
            </>
          )}
        </button>
      </div>

      {/* Control Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("zones")}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "zones"
              ? "bg-blue-600 text-white shadow-md"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
          }`}
        >
          📁 أقسام الأعمدة الثلاثة (الأيمن، الأوسط، الأيسر)
        </button>

        <button
          onClick={() => setActiveTab("fullWidth")}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "fullWidth"
              ? "bg-purple-600 text-white shadow-md"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
          }`}
        >
          📢 وضع العرض الكامل (Full-Width Mode)
        </button>

        <button
          onClick={() => setActiveTab("dimensions")}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "dimensions"
              ? "bg-emerald-600 text-white shadow-md"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
          }`}
        >
          📏 الأبعاد والمسافات والروابط
        </button>
      </div>

      {/* TAB 1: Three Main Columns (Right, Center, Left) */}
      {activeTab === "zones" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Right Zone Card */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span>القسم الأيمن (Right Column)</span>
              </h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={footerSettings.right.enabled}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      right: { ...prev.right, enabled: e.target.checked },
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  عنوان القسم الأيمن:
                </label>
                <input
                  type="text"
                  value={footerSettings.right.title}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      right: { ...prev.right, title: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-bold"
                  placeholder="عن المتجر"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  نص القسم الأيمن:
                </label>
                <textarea
                  rows={3}
                  value={footerSettings.right.text}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      right: { ...prev.right, text: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  صورة القسم الأيمن (اختياري):
                </label>
                <ImageUploader
                  label="صورة القسم الأيمن"
                  image={footerSettings.right.imageUrl}
                  onUpload={(url: string) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      right: { ...prev.right, imageUrl: url },
                    }))
                  }
                  bucket="site-assets"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                    عرض الصورة (px):
                  </label>
                  <input
                    type="number"
                    value={footerSettings.right.imageWidth}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        right: { ...prev.right, imageWidth: Number(e.target.value) },
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                    ارتفاع الصورة (px):
                  </label>
                  <input
                    type="number"
                    value={footerSettings.right.imageHeight}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        right: { ...prev.right, imageHeight: Number(e.target.value) },
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  حجم الخط (Font Size): {footerSettings.right.fontSize}px
                </label>
                <input
                  type="range"
                  min={11}
                  max={20}
                  value={footerSettings.right.fontSize}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      right: { ...prev.right, fontSize: Number(e.target.value) },
                    }))
                  }
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Center Zone Card */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                <span>القسم الأوسط (Center Column)</span>
              </h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={footerSettings.center.enabled}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      center: { ...prev.center, enabled: e.target.checked },
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  عنوان القسم الأوسط:
                </label>
                <input
                  type="text"
                  value={footerSettings.center.title}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      center: { ...prev.center, title: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-bold"
                  placeholder="رسالتنا وخدماتنا"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  نص القسم الأوسط:
                </label>
                <textarea
                  rows={3}
                  value={footerSettings.center.text}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      center: { ...prev.center, text: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  صورة / شعار القسم الأوسط:
                </label>
                <ImageUploader
                  label="صورة / شعار القسم الأوسط"
                  image={footerSettings.center.imageUrl}
                  onUpload={(url: string) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      center: { ...prev.center, imageUrl: url },
                    }))
                  }
                  bucket="site-assets"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                    عرض الصورة (px):
                  </label>
                  <input
                    type="number"
                    value={footerSettings.center.imageWidth}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        center: { ...prev.center, imageWidth: Number(e.target.value) },
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                    ارتفاع الصورة (px):
                  </label>
                  <input
                    type="number"
                    value={footerSettings.center.imageHeight}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        center: { ...prev.center, imageHeight: Number(e.target.value) },
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  حجم الخط: {footerSettings.center.fontSize}px
                </label>
                <input
                  type="range"
                  min={11}
                  max={20}
                  value={footerSettings.center.fontSize}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      center: { ...prev.center, fontSize: Number(e.target.value) },
                    }))
                  }
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Left Zone Card */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>القسم الأيسر (Left Column)</span>
              </h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={footerSettings.left.enabled}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      left: { ...prev.left, enabled: e.target.checked },
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  عنوان القسم الأيسر:
                </label>
                <input
                  type="text"
                  value={footerSettings.left.title}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      left: { ...prev.left, title: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-bold"
                  placeholder="الطلب والتواصل"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  نص القسم الأيسر:
                </label>
                <textarea
                  rows={3}
                  value={footerSettings.left.text}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      left: { ...prev.left, text: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  رابط زر الاتصال (URL/Phone):
                </label>
                <input
                  type="text"
                  value={footerSettings.left.linkUrl}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      left: { ...prev.left, linkUrl: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono"
                  placeholder="tel:07800000000"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  حجم الخط: {footerSettings.left.fontSize}px
                </label>
                <input
                  type="range"
                  min={11}
                  max={20}
                  value={footerSettings.left.fontSize}
                  onChange={(e) =>
                    setFooterSettings((prev) => ({
                      ...prev,
                      left: { ...prev.left, fontSize: Number(e.target.value) },
                    }))
                  }
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Full-Width Mode (وضع العرض الكامل) */}
      {activeTab === "fullWidth" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-purple-200 dark:border-purple-800/40 p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
                <span>📢</span>
                <span>وضع العرض الكامل (Full-Width Span Banner Mode)</span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                تفعيل شريط تنبيه أو إرشادات يمتد بعرض 100% فوق ذيل الصفحة بدون التداخل مع الأعمدة
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={footerSettings.fullWidth.enabled}
                onChange={(e) =>
                  setFooterSettings((prev) => ({
                    ...prev,
                    fullWidth: { ...prev.fullWidth, enabled: e.target.checked },
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                عنوان الشريط الكامل:
              </label>
              <input
                type="text"
                value={footerSettings.fullWidth.title}
                onChange={(e) =>
                  setFooterSettings((prev) => ({
                    ...prev,
                    fullWidth: { ...prev.fullWidth, title: e.target.value },
                  }))
                }
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-bold"
                placeholder="إرشادات وشروط الشراء بالجملة"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  لون الخلفية (Background):
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={footerSettings.fullWidth.bgColor}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        fullWidth: { ...prev.fullWidth, bgColor: e.target.value },
                      }))
                    }
                    className="w-10 h-9 rounded-lg cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={footerSettings.fullWidth.bgColor}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        fullWidth: { ...prev.fullWidth, bgColor: e.target.value },
                      }))
                    }
                    className="w-full px-2 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-800 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  لون النص (Text Color):
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={footerSettings.fullWidth.textColor}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        fullWidth: { ...prev.fullWidth, textColor: e.target.value },
                      }))
                    }
                    className="w-10 h-9 rounded-lg cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={footerSettings.fullWidth.textColor}
                    onChange={(e) =>
                      setFooterSettings((prev) => ({
                        ...prev,
                        fullWidth: { ...prev.fullWidth, textColor: e.target.value },
                      }))
                    }
                    className="w-full px-2 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-800 border rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
              نص التنبيه / الإرشادات الشامل:
            </label>
            <textarea
              rows={3}
              value={footerSettings.fullWidth.text}
              onChange={(e) =>
                setFooterSettings((prev) => ({
                  ...prev,
                  fullWidth: { ...prev.fullWidth, text: e.target.value },
                }))
              }
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium"
            />
          </div>
        </div>
      )}

      {/* TAB 3: Dimensions & Controls */}
      {activeTab === "dimensions" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-emerald-200 dark:border-emerald-800/40 p-6 space-y-5 shadow-sm">
          <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <span>📏</span>
            <span>الأبعاد، الحواف الشاملة، وعرض الروابط الإضافية</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                الحد الأدنى لارتفاع الفوتر (px): {footerSettings.footerMinHeight}px
              </label>
              <input
                type="range"
                min={100}
                max={300}
                value={footerSettings.footerMinHeight}
                onChange={(e) =>
                  setFooterSettings((prev) => ({
                    ...prev,
                    footerMinHeight: Number(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                الحشو العمودي (Padding Y): {footerSettings.containerPaddingY}px
              </label>
              <input
                type="range"
                min={10}
                max={80}
                value={footerSettings.containerPaddingY}
                onChange={(e) =>
                  setFooterSettings((prev) => ({
                    ...prev,
                    containerPaddingY: Number(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                الحشو الأفقي (Padding X): {footerSettings.containerPaddingX}px
              </label>
              <input
                type="range"
                min={8}
                max={48}
                value={footerSettings.containerPaddingX}
                onChange={(e) =>
                  setFooterSettings((prev) => ({
                    ...prev,
                    containerPaddingX: Number(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={footerSettings.showSocialLinks}
                onChange={(e) =>
                  setFooterSettings((prev) => ({ ...prev, showSocialLinks: e.target.checked }))
                }
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-xs font-bold">عرض روابط صفحات السوشيال ميديا أسفل الفوتر</span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={footerSettings.showAppDownloadLinks}
                onChange={(e) =>
                  setFooterSettings((prev) => ({ ...prev, showAppDownloadLinks: e.target.checked }))
                }
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-xs font-bold">عرض روابط تحميل تطبيقات الهواتف الذكية</span>
            </label>
          </div>
        </div>
      )}

      {/* Real-Time Live Preview Section */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-3xl border border-gray-300 dark:border-gray-700 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <span>👁️</span>
            <span>معاينة حية وتفاعلية لـ ذيل الصفحة (Live Preview)</span>
          </h3>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-extrabold rounded-full">
            تحديث فوري عند التعديل
          </span>
        </div>

        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl overflow-hidden shadow-inner">
          <footer
            className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 transition-colors"
            style={{
              minHeight: `${footerSettings.footerMinHeight}px`,
              paddingTop: `${footerSettings.containerPaddingY}px`,
              paddingBottom: `${footerSettings.containerPaddingY}px`,
            }}
          >
            {footerSettings.fullWidth.enabled && (
              <div
                className="w-full py-3 px-4 mb-6 rounded-xl text-center sm:text-right"
                style={{
                  backgroundColor: footerSettings.fullWidth.bgColor,
                  color: footerSettings.fullWidth.textColor,
                }}
              >
                <p className="font-bold text-xs">{footerSettings.fullWidth.title}</p>
                <p className="text-[11px] opacity-90">{footerSettings.fullWidth.text}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start px-4">
              {footerSettings.right.enabled && (
                <div className="space-y-1">
                  <p className="font-bold text-xs text-gray-900 dark:text-white">{footerSettings.right.title}</p>
                  <p className="text-[11px] leading-relaxed" style={{ fontSize: `${footerSettings.right.fontSize}px` }}>
                    {footerSettings.right.text}
                  </p>
                </div>
              )}
              {footerSettings.center.enabled && (
                <div className="text-center space-y-1">
                  <p className="font-bold text-xs text-gray-900 dark:text-white">{footerSettings.center.title}</p>
                  <p className="text-[11px] leading-relaxed" style={{ fontSize: `${footerSettings.center.fontSize}px` }}>
                    {footerSettings.center.text}
                  </p>
                </div>
              )}
              {footerSettings.left.enabled && (
                <div className="space-y-1 text-left">
                  <p className="font-bold text-xs text-gray-900 dark:text-white">{footerSettings.left.title}</p>
                  <p className="text-[11px] leading-relaxed" style={{ fontSize: `${footerSettings.left.fontSize}px` }}>
                    {footerSettings.left.text}
                  </p>
                </div>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
