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
  const { signIn, signUp, signInWithGoogle, user, loading, guestLogin } = useAuth();
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
    // Read query parameter if mode=signup or upgrade=true is specified
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "signup" || params.get("upgrade") === "true") {
        setMode("signup");
      }
    }
  }, []);

  useEffect(() => {
    // Only redirect if user is logged in WITH A REAL REGISTERED ACCOUNT (not a guest)
    if (!loading && user && !user.isGuest && !user.id?.startsWith("guest-")) {
      const target = user.role === "customer" ? "/" : "/dashboard";
      window.location.href = target;
    }
  }, [user, loading]);

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

  // Only render redirection loader if user is logged in as an official registered user
  if (user && !user.isGuest && !user.id?.startsWith("guest-")) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        <p className="text-gray-700 dark:text-gray-300 font-semibold text-lg animate-pulse">
          تم تسجيل الدخول بنجاح! جاري التوجيه...
        </p>
      </div>
    );
  }

  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (mode === "login") {
      const { error: authError } = await signIn(email, password);
      if (authError) {
        let msg = authError.message;
        if (msg === "Invalid login credentials") {
          msg = "بيانات الدخول غير صحيحة، يرجى التأكد من البريد وكلمة المرور";
        } else if (msg === "Email not confirmed") {
          msg = "تم تأكيد حسابك من الخادم، يرجى إعادة محاولة تسجيل الدخول الآن";
        }
        setError(msg);
        setSubmitting(false);
        return;
      }
      window.location.href = "/dashboard";
    } else if (mode === "signup") {
      const { error: authError } = await signUp(email, password, fullName, "customer");
      if (authError) {
        setError(authError.message === "User already registered"
          ? "هذا البريد الإلكتروني مسجل بالفعل، يمكنك تسجيل الدخول مباشرة"
          : authError.message);
        setSubmitting(false);
        return;
      }
      // Attempt auto sign in after sign up
      const { error: autoSignInError } = await signIn(email, password);
      if (!autoSignInError) {
        window.location.href = "/";
        return;
      }
      setError("");
      setSignupSuccess(true);
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    const { error: authError } = await signInWithGoogle();
    if (authError) {
      setError(authError.message || "حدث خطأ أثناء تسجيل الدخول بواسطة Google");
    }
  };

  const handleGuestLogin = () => {
    if (!guestName.trim()) { setError("الرجاء إدخال الاسم"); return; }
    if (!governorate) { setError("الرجاء اختيار المحافظة"); return; }
    guestLogin(guestName.trim(), governorate);
    router.replace("/");
  };

  if (signupSuccess) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 ${settings.darkMode ? "dark" : ""}`} dir="rtl">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 border border-emerald-200 dark:border-emerald-800/60 text-center space-y-6 animate-scaleUp">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/80 rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-md ring-4 ring-emerald-50 dark:ring-emerald-900/40">
            📩
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
              تم التسجيل بنجاح! 🎉
            </h2>
            <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300 leading-relaxed bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/40">
              شكراً لتسجيلك بالموقع! يرجى الذهاب إلى إيميلك الذي سجلت به وإتمام التأكيد حتى يُسمح لك بالدخول للموقع
            </p>
            {email && (
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 dir-ltr font-mono">
                {email}
              </p>
            )}
          </div>

          <div className="pt-2 space-y-3">
            <button
              onClick={() => {
                setSignupSuccess(false);
                setMode("login");
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>🔑</span>
              <span>العودة لصفحة تسجيل الدخول</span>
            </button>
            
            <Link
              href="/"
              className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs transition-colors block text-center"
            >
              العودة للصفحة الرئيسية 🏠
            </Link>
          </div>
        </div>
      </div>
    );
  }

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

          {(user?.isGuest || user?.id?.startsWith("guest-")) && (
            <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-200 dark:border-blue-700 text-right shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🌟</span>
                <h3 className="font-bold text-sm text-blue-900 dark:text-blue-200">ترقية حسابك إلى حساب رسمي</h3>
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                أنت متصل حالياً كـ <strong>({user.fullName || "ضيف"})</strong>. قم بإنشاء حسابك الرسمي أو تسجيل الدخول لحفظ طلباتك وسلتك دائماً.
              </p>
            </div>
          )}

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

              <div className="relative my-4 flex items-center justify-center">
                <div className="border-t border-gray-300 dark:border-gray-600 w-full" />
                <span className="bg-white dark:bg-gray-800 px-3 text-xs text-gray-500 dark:text-gray-400 absolute">أو</span>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3 px-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium text-base transition flex items-center justify-center gap-3 shadow-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>تسجيل الدخول باستخدام Google</span>
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
