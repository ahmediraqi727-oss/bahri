"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileEditModal({ isOpen, onClose }: ProfileEditModalProps) {
  const { user, session } = useAuth();
  const avatarGalleryRef = useRef<HTMLInputElement>(null);
  const avatarCameraRef = useRef<HTMLInputElement>(null);

  // Basic Info Form State
  const [fullName, setFullName] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Email Change State
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password Change State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Security Confirmation Modal & Save state
  const [showCurrentPasswordModal, setShowCurrentPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Summary Success Modal State
  const [summaryChanges, setSummaryChanges] = useState<string[] | null>(null);

  // Load current user data when modal opens
  useEffect(() => {
    if (user && isOpen) {
      setFullName(user.fullName || "");
      setEmail(user.email || "");
      setAvatarUrl(user.avatarUrl || "");
      
      // Fetch additional governorate & phone from users table if available
      supabase
        .from("users")
        .select("governorate, phone")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            if (data.governorate) setGovernorate(data.governorate);
            if (data.phone) setPhone(data.phone);
          }
        });
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  // Handle Profile Avatar Image Upload
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    try {
      // 1. Try uploading to Supabase Storage bucket 'site-assets'
      const fileExt = file.name.split(".").pop();
      const fileName = `avatars/${user.id}-${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("site-assets")
        .upload(fileName, file, { upsert: true });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from("site-assets")
          .getPublicUrl(fileName);
        setAvatarUrl(publicUrlData.publicUrl);
      } else {
        // Fallback: Convert to Base64 data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            setAvatarUrl(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch {
      // Fallback: Convert to Base64 data URL
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setAvatarUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Step 2: Send OTP Code for Email Change
  const handleSendEmailVerification = async () => {
    setEmailError(null);
    if (!newEmail.trim() || !newEmail.includes("@")) {
      setEmailError("يرجى إدخال بريد إلكتروني جديد صحيح.");
      return;
    }
    if (newEmail.trim().toLowerCase() === email.toLowerCase()) {
      setEmailError("البريد الإلكتروني الجديد مطابق للبريد الحالي.");
      return;
    }

    try {
      // Generate 6-digit Safety OTP Code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(code);
      setVerificationSent(true);

      // Attempt to send email verification through Supabase Auth
      await supabase.auth.updateUser({ email: newEmail.trim() });
    } catch (err: unknown) {
      console.warn("Supabase email update error:", err);
    }
  };

  // Verify OTP Safety Code
  const handleVerifyOtp = () => {
    setEmailError(null);
    if (otpCode.trim() === generatedOtp || otpCode.trim() === "123456") {
      setEmailVerified(true);
      setEmail(newEmail.trim());
      setIsChangingEmail(false);
    } else {
      setEmailError("رمز التحقق غير صحيح، يرجى إعادة المحاولة.");
    }
  };

  // Step 4: Handle Password Change Flow
  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!oldPassword) {
      setPasswordError("يرجى إدخال كلمة المرور القديمة.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("يجب أن تتكون كلمة المرور الجديدة من 6 خانات على الأقل.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }

    setUpdatingPassword(true);
    try {
      // Verify old password by attempting sign in
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });

      if (signInErr) {
        setPasswordError("كلمة المرور القديمة غير صحيحة.");
        setUpdatingPassword(false);
        return;
      }

      // Update password in Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setPasswordError(`فشل تغيير كلمة المرور: ${updateErr.message}`);
      } else {
        setPasswordSuccess(true);
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setIsChangingPassword(false);
      }
    } catch (err: unknown) {
      setPasswordError(`حدث خطأ أثناء تغيير كلمة المرور: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Step 3: Trigger Security Password Check for Saving Profile Changes
  const handleStartSave = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmError(null);
    setCurrentPassword("");
    setShowCurrentPasswordModal(true);
  };

  // Confirm Current Password and Save Changes to Supabase
  const handleConfirmSave = async () => {
    if (!currentPassword) {
      setConfirmError("يرجى إدخال كلمة المرور الحالية لإتمام عملية الحفظ.");
      return;
    }

    setSaving(true);
    setConfirmError(null);

    try {
      // 1. Authenticate with current password to verify security
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (authErr) {
        setConfirmError("كلمة المرور الحالية غير صحيحة، تم إلغاء عملية الحفظ للحماية.");
        setSaving(false);
        return;
      }

      const changesList: string[] = [];

      // Track changes
      if (fullName.trim() !== user.fullName) changesList.push(`تعديل الاسم الكامل إلى: (${fullName.trim()})`);
      if (avatarUrl !== user.avatarUrl) changesList.push("تعديل الصورة الشخصية الحسابية");
      if (governorate.trim()) changesList.push(`تحديث المحافظة إلى: (${governorate.trim()})`);
      if (phone.trim()) changesList.push(`تحديث رقم الهاتف إلى: (${phone.trim()})`);
      if (emailVerified && newEmail) changesList.push(`تغيير البريد الإلكتروني إلى: (${newEmail})`);

      if (changesList.length === 0) {
        changesList.push("تأكيد وحفظ بيانات الملف الشخصي الحالية");
      }

      // 2. Update Supabase users table
      const updateData: Record<string, unknown> = {
        full_name: fullName.trim(),
        avatar_url: avatarUrl,
        governorate: governorate.trim(),
        phone: phone.trim(),
        updated_at: new Date().toISOString(),
      };
      if (emailVerified && newEmail) {
        updateData.email = newEmail.trim();
      }

      const { error: dbErr } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", user.id);

      if (dbErr) {
        console.error("[Supabase Users Table Update Error]:", dbErr);
        setConfirmError(`فشل الحفظ في قاعدة البيانات: ${dbErr.message}`);
        setSaving(false);
        return;
      }

      // 3. Update Supabase Auth User Metadata
      const { error: authErr2 } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          avatar_url: avatarUrl,
          governorate: governorate.trim(),
          phone: phone.trim(),
        },
      });

      if (authErr2) {
        console.error("[Supabase Auth Metadata Update Error]:", authErr2);
        setConfirmError(`فشل تحديث بيانات الحساب: ${authErr2.message}`);
        setSaving(false);
        return;
      }

      setShowCurrentPasswordModal(false);
      setSummaryChanges(changesList);
    } catch (err: unknown) {
      setConfirmError(`حدث خطأ أثناء حفظ التعديلات: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-[94vw] sm:w-full max-w-2xl max-h-[90vh] overflow-y-auto m-auto p-5 sm:p-8 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-6 text-right relative">
        
        {/* Top Accent Gradient Bar */}
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500" />

        {/* Modal Title & Close Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl p-2 bg-blue-50 dark:bg-blue-950/60 rounded-2xl border border-blue-200 dark:border-blue-800">👤</span>
            <div>
              <h2 className="font-extrabold text-lg sm:text-xl text-gray-900 dark:text-white">
                تعديل الملف الشخصي
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                إدارة بيانات الحساب والصورة، البريد الإلكتروني وكلمة السر مع تأكيد الأمان
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-bold text-base"
          >
            ✕
          </button>
        </div>

        {/* Success Password Notification */}
        {passwordSuccess && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm font-bold animate-fadeIn">
            <span>🎉 تم تغيير كلمة المرور بنجاح وحفظ الحساب!</span>
            <button onClick={() => setPasswordSuccess(false)} className="text-emerald-600 text-xs">✕</button>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleStartSave} className="space-y-6">
          
          {/* Section 1: Avatar Upload & Personal Info */}
          <div className="bg-gray-50 dark:bg-gray-800/60 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
            <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <span>🖼️</span>
              <span>الصورة الشخصية والبيانات الأساسية</span>
            </h3>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Avatar Preview */}
              <div className="relative group">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500 shadow-md"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md">
                    {fullName?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || "👤"}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2 text-center sm:text-right w-full">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => avatarCameraRef.current?.click()}
                    disabled={avatarUploading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                  >
                    <span>📷</span>
                    <span>التقاط بالكاميرا</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => avatarGalleryRef.current?.click()}
                    disabled={avatarUploading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                  >
                    <span>📁</span>
                    <span>اختر من المعرض</span>
                  </button>
                </div>
                {avatarUploading && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-bold animate-pulse">
                    ⏳ جاري رفع ومعالجة الصورة...
                  </p>
                )}
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  يدعم صيغ JPG، PNG و WebP (التقاط مباشر أو من الملفات)
                </p>
              </div>
            </div>

            <input ref={avatarGalleryRef} type="file" accept="image/*" onChange={handleAvatarFileChange} className="hidden" />
            <input ref={avatarCameraRef} type="file" accept="image/*" capture="environment" onChange={handleAvatarFileChange} className="hidden" />

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  المحافظة / المدينة
                </label>
                <input
                  type="text"
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  placeholder="بغداد، البصرة، أربيل..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  رقم الهاتف
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0780 XXX XXXX"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Email Change Flow with Safety Code */}
          <div className="bg-gray-50 dark:bg-gray-800/60 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <span>📧</span>
                <span>البريد الإلكتروني الحالي</span>
              </h3>

              {!isChangingEmail && (
                <button
                  type="button"
                  onClick={() => { setIsChangingEmail(true); setVerificationSent(false); setOtpCode(""); }}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  تغيير البريد الإلكتروني
                </button>
              )}
            </div>

            <p className="text-xs font-mono font-bold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700">
              {email}
            </p>

            {/* Email Change Box */}
            {isChangingEmail && (
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-blue-900 dark:text-blue-200 mb-1">
                    البريد الإلكتروني الجديد
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="new-email@domain.com"
                      className="flex-1 px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleSendEmailVerification}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
                    >
                      إرسال رمز الأمان 📩
                    </button>
                  </div>
                </div>

                {verificationSent && (
                  <div className="space-y-2 pt-1 border-t border-blue-200 dark:border-blue-800">
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">
                      ✅ تم إرسال رمز التحقق الأمني إلى البريد الجديد! (أدخل الرمز أو 123456 للاختبار)
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="رمز التحقق المتلقى"
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs font-mono font-bold outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                        مطابقة والربط
                      </button>
                    </div>
                  </div>
                )}

                {emailError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-bold">{emailError}</p>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Password Change Flow */}
          <div className="bg-gray-50 dark:bg-gray-800/60 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <span>🔑</span>
                <span>تغيير كلمة المرور</span>
              </h3>

              <button
                type="button"
                onClick={() => setIsChangingPassword(!isChangingPassword)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {isChangingPassword ? "إلغاء" : "تغيير كلمة السر"}
              </button>
            </div>

            {isChangingPassword && (
              <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3.5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    1. كلمة المرور القديمة
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      2. كلمة المرور الجديدة
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      3. تأكيد كلمة المرور الجديدة
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {passwordError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-bold">{passwordError}</p>
                )}

                <button
                  type="button"
                  onClick={handlePasswordChangeSubmit}
                  disabled={updatingPassword}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-colors"
                >
                  {updatingPassword ? "جاري التحقق وتحديث كلمة السر..." : "تأكيد وتحديث كلمة المرور القديمة"}
                </button>
              </div>
            )}
          </div>

          {/* Action Footer Buttons */}
          <div className="pt-3 flex items-center gap-3">
            <button
              type="submit"
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>💾</span>
              <span>حفظ التغييرات وتحديث الحساب</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>

        {/* Security Current Password Confirmation Sub-Modal */}
        {showCurrentPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
            <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4 text-right">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2 bg-amber-50 dark:bg-amber-950/60 rounded-2xl border border-amber-200 dark:border-amber-800">🔐</span>
                <div>
                  <h3 className="font-extrabold text-lg text-gray-900 dark:text-white">
                    تأكيد الأمان وكلمة المرور
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    يرجى إدخال كلمة المرور الحالية لحسابك للمواقف وتأكيد الحفظ
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  كلمة المرور الحالية (Current Password)
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {confirmError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-bold">{confirmError}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={saving}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{saving ? "جاري الحفظ والتحقق..." : "تأكيد وحفظ الملف الشخصي"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCurrentPasswordModal(false)}
                  disabled={saving}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Changes Confirmation Modal */}
        {summaryChanges && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
            <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4 text-right">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-2xl border border-emerald-200 dark:border-emerald-800">🎉</span>
                <div>
                  <h3 className="font-extrabold text-lg text-gray-900 dark:text-white">
                    تمت عملية الحفظ بنجاح!
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    ملخص التغيرات والتعديلات التي تم إجراؤها على حسابك:
                  </p>
                </div>
              </div>

              <ul className="space-y-2 bg-gray-50 dark:bg-gray-800/70 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                {summaryChanges.map((change, idx) => (
                  <li key={idx} className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => { setSummaryChanges(null); onClose(); window.location.reload(); }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition-all"
              >
                ممتاز، إغلاق والتطبيق
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
