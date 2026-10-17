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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className="bg-[#160b2e] border border-purple-500/35 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] max-w-lg w-full p-5 sm:p-6 overflow-hidden flex flex-col max-h-[90vh] text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-purple-500/20 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-purple-600/25 border border-purple-400/30 flex items-center justify-center text-xl text-purple-300 shadow-inner">
              ⚙️
            </span>
            <div>
              <h3 className="font-extrabold text-base text-white">إعدادات دقة وسرعة الكاميرا</h3>
              <p className="text-[11px] text-purple-200/75">تحسين استقرار المسح ومنع التهنيج على الأجهزة الضعيفة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 border border-white/15 flex items-center justify-center text-purple-200 hover:text-white text-sm font-bold transition-all cursor-pointer"
            title="إغلاق"
          >
            ✕
          </button>
        </div>

        {/* Quick One-Click Presets */}
        <div className="pt-3.5 pb-2 flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={applyLowEndPreset}
            className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              isLowEndPreset
                ? "bg-amber-500/25 text-amber-200 border-amber-400/60 shadow-sm"
                : "bg-[#221142] hover:bg-[#2d1757] text-amber-300/90 border-purple-500/25"
            }`}
          >
            <span>❄️ وضع الأجهزة الضعيفة</span>
            <span className="text-[10px] opacity-80">(480p @ 15fps)</span>
          </button>

          <button
            type="button"
            onClick={applyDefaultPreset}
            className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              isDefaultPreset
                ? "bg-[#7c3aed] text-white border-purple-400/60 shadow-sm"
                : "bg-[#221142] hover:bg-[#2d1757] text-purple-200 border-purple-500/25"
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
            <label className="block text-xs font-bold text-purple-200 mb-2">
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
                    className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? "bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] text-white border-purple-400 shadow-md ring-2 ring-purple-400/30"
                        : "bg-[#211040] hover:bg-[#2b1552] text-purple-100 border-purple-500/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-sm whitespace-nowrap">{opt.label}</span>
                      {opt.badge && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : opt.isLightweight
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                              : "bg-purple-900/60 text-purple-200"
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] font-mono ${isSelected ? "text-purple-100" : "text-purple-300/70"}`}>
                      {opt.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Frame Rate */}
          <div>
            <label className="block text-xs font-bold text-purple-200 mb-2">
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
                    className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                      isSelected
                        ? "bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/30"
                        : "bg-[#211040] hover:bg-[#2b1552] text-purple-100 border-purple-500/25"
                    }`}
                  >
                    <span className="font-extrabold text-xs whitespace-nowrap">{opt.label}</span>
                    <span className={`text-[10px] mt-0.5 ${isSelected ? "text-emerald-100" : "text-purple-300/70"}`}>
                      {opt.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Low-End Stability Tip */}
          <div className="bg-[#211040] border border-purple-400/30 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-purple-100">
            <span className="text-base leading-none shrink-0">💡</span>
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="font-bold text-purple-200">نصيحة لتحقيق أقصى استقرار على الأجهزة الضعيفة:</p>
              <p className="text-purple-200/80">
                تقليل الدقة إلى <strong>480p</strong> مع معدل <strong>15 FPS</strong> يخفض استهلاك المعالج بنسبة تصل إلى <strong>65%</strong>،
                ويمنع سخونة الهاتف وسقوط إطارات الكاميرا مع الحفاظ على قدرة فك تشفير الباركود بدقة كاملة.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3.5 border-t border-purple-500/20 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-purple-200 hover:bg-purple-900/40 transition-all cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex-1 max-w-[210px] px-5 py-2.5 rounded-xl bg-gradient-to-l from-[#6d28d9] to-[#7c3aed] hover:from-[#5b21b6] hover:to-[#6d28d9] active:scale-95 text-white font-extrabold text-xs shadow-md shadow-purple-900/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>حفظ وتطبيق فوري ✓</span>
          </button>
        </div>
      </div>
    </div>
  );
}
