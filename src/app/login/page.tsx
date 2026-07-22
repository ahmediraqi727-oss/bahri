"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";

const GOVERNORATES = [
  "بغداد", "نينوى", "البصرة", "ذي قار", "بابل",
  "السليمانية", "الأنبار", "أربيل", "ديالى", "كركوك",
  "النجف", "صلاح الدين", "واسط", "ميسان", "كربلاء",
  "الديوانية", "دهوك", "المثنى", "حلبجة",
];

export default function LoginPage() {
  const { signIn, signUp, user, loading, guestLogin } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "guest">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [govOpen, setGovOpen] = useState(false);
  const govRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === "customer" ? "/" : "/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (govRef.current && !govRef.current.contains(e.target as Node)) setGovOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (mode === "login") {
      const { error: authError } = await signIn(email, password);
      if (authError) {
        setError(authError.message === "Invalid login credentials"
          ? "بيانات الدخول غير صحيحة"
          : authError.message);
        setSubmitting(false);
        return;
      }
      router.replace("/dashboard");
    } else if (mode === "signup") {
      const { error: authError } = await signUp(email, password, fullName, "customer");
      if (authError) {
        setError(authError.message === "User already registered"
          ? "هذا البريد الإلكتروني مسجل بالفعل"
          : authError.message);
        setSubmitting(false);
        return;
      }
      setError("");
      alert("تم التسجيل بنجاح! تحقق من بريدك الإلكتروني لتأكيد الحساب.");
      setMode("login");
      setSubmitting(false);
    }
  };

  const handleGuestLogin = () => {
    if (!guestName.trim()) { setError("الرجاء إدخال الاسم"); return; }
    if (!governorate) { setError("الرجاء اختيار المحافظة"); return; }
    guestLogin(guestName.trim(), governorate);
    router.replace("/");
  };

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 ${settings.darkMode ? "dark" : ""}`}>
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
          <div className="text-center mb-8">
            <img src="/logo.jpg" alt="شعار أحمد بحري" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-xl ring-4 ring-blue-100 dark:ring-blue-900" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {mode === "guest" ? "دخول كضيف" : mode === "login" ? "تسجيل الدخول" : "حساب جديد"}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {mode === "guest" ? "أدخل اسمك ومحافظتك للتسوق" : mode === "login" ? "أدخل بياناتك للدخول" : "أنشئ حسابك للتسوق"}
            </p>
          </div>

          {mode === "guest" ? (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الاسم</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="أدخل اسمك"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">المحافظة</label>
                <div className="relative" ref={govRef}>
                  <button
                    type="button"
                    onClick={() => setGovOpen(!govOpen)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-right flex items-center justify-between"
                  >
                    <span className={governorate ? "" : "text-gray-400"}>{governorate || "اختر المحافظة"}</span>
                    <svg className={`w-4 h-4 transition-transform ${govOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {govOpen && (
                    <div className="absolute top-full mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden z-50 max-h-60 overflow-y-auto">
                      {GOVERNORATES.map((g) => (
                        <button
                          key={g}
                          onClick={() => { setGovernorate(g); setGovOpen(false); }}
                          className={`w-full text-right px-4 py-3 text-sm transition-colors hover:bg-blue-50 dark:hover:bg-gray-600 ${
                            governorate === g ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium" : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleGuestLogin}
                className="w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-lg transition shadow-lg shadow-green-600/25"
              >
                دخول كضيف
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الاسم الكامل</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="أحمد بحري"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="ahmed@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">كلمة المرور</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-lg transition shadow-lg shadow-blue-600/25"
              >
                {submitting ? "جاري التحميل..." : mode === "login" ? "دخول" : "إنشاء حساب"}
              </button>
            </form>
          )}

          {mode !== "guest" && (
            <div className="mt-6 text-center">
              <button
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                {mode === "login" ? "ليس لديك حساب؟ أنشئ حساب جديد" : "لديك حساب؟ سجّل الدخول"}
              </button>
            </div>
          )}

          <div className="mt-4 text-center">
            {mode !== "guest" ? (
              <button
                onClick={() => { setMode("guest"); setError(""); }}
                className="text-green-600 dark:text-green-400 hover:underline text-sm font-medium"
              >
                دخول كضيف
              </button>
            ) : (
              <button
                onClick={() => { setMode("login"); setError(""); }}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                تسجيل الدخول بحساب
              </button>
            )}
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-gray-500 dark:text-gray-400 hover:underline text-sm">
              العودة للمتجر
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
