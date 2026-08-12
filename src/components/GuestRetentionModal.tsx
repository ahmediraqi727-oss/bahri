"use client";

import Link from "next/link";

interface GuestRetentionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLogout: () => void;
}

export default function GuestRetentionModal({ isOpen, onClose, onConfirmLogout }: GuestRetentionModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800/60 rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-hidden text-right space-y-4"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "scaleUp 0.2s ease" }}
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center text-3xl mx-auto shadow-sm">
          ⚠️
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">
            تنبيه حفظ البيانات والرسائل!
          </h3>
          <p className="text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300 leading-relaxed bg-amber-50 dark:bg-amber-950/40 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/40">
            رسائلك ستحذف. رقي حسابك مجاناً إلى حساب رسمي بتسجيلك بالموقع عبر الإيميل
          </p>
        </div>

        <div className="pt-2 space-y-2.5">
          <Link
            href="/login?mode=signup&upgrade=true"
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>🔑</span>
            <span>ترقية الحساب إلى حساب رسمي مجاناً</span>
          </Link>

          <button
            onClick={() => {
              onClose();
              onConfirmLogout();
            }}
            className="w-full py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-xs transition-colors block text-center"
          >
            متابعة الخروج وفقدان البيانات 🗑️
          </button>
        </div>
      </div>
    </div>
  );
}
