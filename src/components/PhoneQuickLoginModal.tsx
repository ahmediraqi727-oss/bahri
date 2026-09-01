"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-client";

interface PhoneQuickLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PhoneQuickLoginModal({ isOpen, onClose, onSuccess }: PhoneQuickLoginModalProps) {
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const cleanPhone = phoneInput.replace(/\D/g, "").trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      setErrorMsg("يرجى أدخال رقم هاتف عراقي صحيح (مثال: 07706166725)");
      return;
    }

    setLoading(true);

    try {
      // Query latest order matching customer phone
      const { data: customerOrders, error } = await supabase
        .from("orders")
        .select("*")
        .or(`customer_phone.eq.${cleanPhone},customer_phone.eq.0${cleanPhone.replace(/^964/, "")}`)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg("حدث خطأ أثناء الاتصال بالسجل: " + error.message);
        setLoading(false);
        return;
      }

      if (!customerOrders || customerOrders.length === 0) {
        // Save phone anyway for future orders
        if (typeof window !== "undefined") {
          localStorage.setItem("customer_profile_phone", cleanPhone);
        }
        setSuccessMsg("تم تسجيل رقم الهاتف بنجاح! لم نجد طلبات سابقة، ولكن سيتم ربط أي طلبات جديدة بهذا الرقم.");
        setTimeout(() => {
          if (onSuccess) onSuccess();
          else window.location.reload();
          onClose();
        }, 1500);
        return;
      }

      // Customer found with past orders
      const latestOrder = customerOrders[0];
      const name = latestOrder.customer_name || "زبون";
      const address = latestOrder.customer_address || "";

      if (typeof window !== "undefined") {
        localStorage.setItem(
          "customer_profile",
          JSON.stringify({ name, phone: cleanPhone, address })
        );
        localStorage.setItem("customer_profile_phone", cleanPhone);

        const existingLocalOrders: string[] = JSON.parse(localStorage.getItem("my_local_orders") || "[]");
        const newOrderIds = customerOrders.map((o) => o.id);
        const mergedIds = Array.from(new Set([...existingLocalOrders, ...newOrderIds]));
        localStorage.setItem("my_local_orders", JSON.stringify(mergedIds));
      }

      setSuccessMsg(`أهلاً بك مجدداً ${name}! تم تسجيل الدخول وجلب (${customerOrders.length}) طلبات سابقة بنجاح.`);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        else window.location.reload();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg("حدث خطأ أثناء تسجيل الدخول السريع: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-right relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center text-xl shadow-md">
              📱
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">تسجيل الدخول السريع برقم الهاتف</h3>
              <p className="text-xs text-gray-400">استعرض سجل فواتيرك وطلباتك السابقة فوراً</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleQuickLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 mb-1.5">
              رقم الهاتف العراقي:
            </label>
            <div className="relative">
              <span className="absolute right-3.5 top-3 text-gray-400 text-base">📞</span>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="07706166725"
                required
                className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-600 outline-none dir-ltr text-right"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">سيتم البحث عن كافة فواتيرك المسجلة بهذا الرقم مباشرة.</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-xs font-bold leading-relaxed">
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold leading-relaxed">
              ✓ {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-2xl font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>استرجاع فواتيري وطلباتي</span>
                <span>🔍</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
