"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { isWelcomeModalDismissed, markWelcomeModalDismissed, updateGuestIdentity, trackVisitorSession } from "@/lib/visitor-tracker";

interface GuestWelcomeModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function GuestWelcomeModal({ forceOpen, onClose }: GuestWelcomeModalProps = {}) {
  const { user, session, loading, guestLogin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      if (user?.fullName && user.fullName !== "ضيف عزيز") setName(user.fullName);
      if (user?.governorate) setGovernorate(user.governorate);
      return;
    }

    if (loading) return;

    // 1. If user is logged in with an official account (User / Manager / Admin with email or valid session), NEVER show modal!
    const isAuthenticatedUser = Boolean(session?.user || (user && user.email && !user.id.startsWith("guest-")));
    
    if (isAuthenticatedUser) {
      markWelcomeModalDismissed();
      trackVisitorSession("/");
      setIsOpen(false);
      return;
    }

    // 2. Only show for anonymous guest visitors who have not dismissed it
    if (!isWelcomeModalDismissed()) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Quietly track session in background
      trackVisitorSession("/");
    }
  }, [user, session, loading, forceOpen]);

  const handleDismiss = async () => {
    setSubmitting(true);
    try {
      guestLogin("ضيف زائر", "");
      markWelcomeModalDismissed();
      await trackVisitorSession("/");
    } catch (err) {
      console.warn("Welcome modal dismiss error:", err);
    } finally {
      setSubmitting(false);
      setIsOpen(false);
      if (onClose) onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanName = name.trim() || "ضيف زائر";
      const cleanGov = governorate.trim();

      // Instantly update AuthContext Guest State!
      guestLogin(cleanName, cleanGov);

      await updateGuestIdentity({
        name: cleanName,
        governorate: cleanGov,
        phone: phone.trim(),
      });

      markWelcomeModalDismissed();
      await trackVisitorSession("/");
      setIsOpen(false);
      if (onClose) onClose();
    } catch (err) {
      console.warn("Welcome modal submit error:", err);
      handleDismiss();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-[92vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto m-auto p-5 sm:p-7 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4 text-right relative flex flex-col justify-between">
        
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500" />

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl p-2 bg-blue-50 dark:bg-blue-950/60 rounded-2xl border border-blue-200 dark:border-blue-800 flex-shrink-0">👋</span>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-white">
                مرحباً بك في متجرنا!
              </h3>
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                يسعدنا زيارتك، يمكنك تزويدنا ببياناتك لتجربة تسوق مخصصة (اختياري)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={submitting}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-bold flex-shrink-0"
            title="إغلاق والدخول كزائر"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              الاسم الكامل (اختياري)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: علي الحسين"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                المحافظة / المدينة
              </label>
              <input
                type="text"
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                placeholder="بغداد، البصرة..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>🚀</span>
              <span>{submitting ? "جاري الحفظ والتسجيل..." : "بدء التسوق والتصفح"}</span>
            </button>
            
            <button
              type="button"
              onClick={handleDismiss}
              disabled={submitting}
              className="px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-extrabold text-xs sm:text-sm transition-colors text-center disabled:opacity-50"
            >
              تخطي كزائر
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
