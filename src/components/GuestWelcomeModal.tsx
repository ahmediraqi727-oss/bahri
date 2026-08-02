"use client";

import { useState, useEffect } from "react";
import { isWelcomeModalDismissed, markWelcomeModalDismissed, updateGuestIdentity, trackVisitorSession } from "@/lib/visitor-tracker";

export default function GuestWelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Check if dismissed
    if (!isWelcomeModalDismissed()) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Always track session quietly in background
      trackVisitorSession("/");
    }
  }, []);

  const handleDismiss = async () => {
    markWelcomeModalDismissed();
    setIsOpen(false);
    await trackVisitorSession("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateGuestIdentity({
        name: name.trim(),
        governorate: governorate.trim(),
        phone: phone.trim(),
      });
      markWelcomeModalDismissed();
      setIsOpen(false);
      await trackVisitorSession("/");
    } catch (err) {
      console.warn("Welcome modal submit error:", err);
      handleDismiss();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 sm:p-8 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-5 text-right relative overflow-hidden">
        
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500" />

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl p-2 bg-blue-50 dark:bg-blue-950/60 rounded-2xl border border-blue-200 dark:border-blue-800">👋</span>
            <div>
              <h3 className="font-extrabold text-lg sm:text-xl text-gray-900 dark:text-white">
                مرحباً بك في متجرنا!
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                يسعدنا زيارتك، يمكنك تزويدنا ببياناتك لتجربة تسوق مخصصة (اختياري)
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-bold"
            title="إغلاق والدخول كزائر"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              الاسم الكامل (اختياري)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: علي الحسين"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                المحافظة / المدينة
              </label>
              <input
                type="text"
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                placeholder="بغداد، البصرة..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                رقم الهاتف
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0780 XXX XXXX"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>🚀</span>
              <span>{submitting ? "جاري الحفظ..." : "بدء التسوق والتصفح"}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm transition-colors"
            >
              تخطي كزائر
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
