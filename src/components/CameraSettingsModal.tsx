"use client";

import React, { useState } from "react";
import {
  CAMERA_RESOLUTIONS,
  CAMERA_FPS_OPTIONS,
  CameraResolutionKey,
  CameraFpsKey,
  CameraSettingsState,
  DEFAULT_CAMERA_SETTINGS,
} from "@/lib/camera-config";

interface CameraSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: CameraSettingsState;
  onSave: (newSettings: CameraSettingsState) => void;
}

export default function CameraSettingsModal({
  isOpen,
  onClose,
  currentSettings,
  onSave,
}: CameraSettingsModalProps) {
  const [resolution, setResolution] = useState<CameraResolutionKey>(currentSettings.resolution);
  const [fps, setFps] = useState<CameraFpsKey>(currentSettings.fps);

  if (!isOpen) return null;

  const isLowEndPreset = resolution === "480p" && fps === 15;
  const isDefaultPreset = resolution === "720p" && fps === 30;

  const handleApply = () => {
    onSave({ resolution, fps });
    onClose();
  };

  const applyLowEndPreset = () => {
    setResolution("480p");
    setFps(15);
  };

  const applyDefaultPreset = () => {
    setResolution("720p");
    setFps(30);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-5 sm:p-6 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-xl text-blue-600 dark:text-blue-400">
              ⚙️
            </span>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">إعدادات دقة وسرعة الكاميرا</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">تحسين استقرار المسح ومنع التهنيج على الأجهزة الضعيفة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 text-sm font-bold transition-all"
            title="إغلاق"
          >
            ✕
          </button>
        </div>

        {/* Quick One-Click Presets */}
        <div className="pt-3 pb-2 flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={applyLowEndPreset}
            className={`flex-1 min-w-[140px] px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
              isLowEndPreset
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 shadow-xs"
                : "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
            }`}
          >
            <span>❄️ وضع الأجهزة الضعيفة</span>
            <span className="text-[10px] opacity-80">(480p @ 15fps)</span>
          </button>

          <button
            type="button"
            onClick={applyDefaultPreset}
            className={`flex-1 min-w-[140px] px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
              isDefaultPreset
                ? "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/50 shadow-xs"
                : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700"
            }`}
          >
            <span>⚖️ الوضع المتوازن</span>
            <span className="text-[10px] opacity-80">(720p @ 30fps)</span>
          </button>
        </div>

        {/* Scrollable Options */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 pl-1">
          {/* Section 1: Resolution */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
              دقة التقاط الكاميرا (Resolution):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(CAMERA_RESOLUTIONS) as CameraResolutionKey[]).map((key) => {
                const opt = CAMERA_RESOLUTIONS[key];
                const isSelected = resolution === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setResolution(key)}
                    className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/40"
                        : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-sm">{opt.label}</span>
                      {opt.badge && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : opt.isLightweight
                              ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                              : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] font-mono ${isSelected ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                      {opt.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Frame Rate */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
              معدل الإطارات في الثانية (Frame Rate - FPS):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(CAMERA_FPS_OPTIONS) as unknown as CameraFpsKey[]).map((numKey) => {
                const opt = CAMERA_FPS_OPTIONS[numKey];
                const isSelected = fps === opt.fps;
                return (
                  <button
                    key={opt.fps}
                    type="button"
                    onClick={() => setFps(opt.fps)}
                    className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center ${
                      isSelected
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400/40"
                        : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <span className="font-extrabold text-xs">{opt.label}</span>
                    <span className={`text-[10px] mt-0.5 ${isSelected ? "text-emerald-100" : "text-gray-500 dark:text-gray-400"}`}>
                      {opt.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Low-End Stability Tip */}
          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
            <span className="text-base leading-none">💡</span>
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="font-bold">نصيحة لتحقيق أقصى استقرار على الأجهزة الضعيفة:</p>
              <p className="text-blue-700 dark:text-blue-300">
                تقليل الدقة إلى <strong>480p</strong> مع معدل <strong>15 FPS</strong> يخفض استهلاك المعالج بنسبة تصل إلى <strong>65%</strong>،
                ويمنع سخونة الهاتف وسقوط إطارات الكاميرا مع الحفاظ على قدرة فك تشفير الباركود بدقة كاملة عبر ZXing.js.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex-1 max-w-[200px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-1.5"
          >
            <span>حفظ وتطبيق فوري ✓</span>
          </button>
        </div>
      </div>
    </div>
  );
}
