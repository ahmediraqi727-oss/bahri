"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import ColorPicker from "@/components/ColorPicker";
import ImageUploader from "@/components/ImageUploader";
import CategoriesManager from "@/components/CategoriesManager";
import WatermarkSettings from "@/components/WatermarkSettings";
import ThemeCustomizer from "@/components/ThemeCustomizer";
import ProfileEditModal from "@/components/ProfileEditModal";
import { SiteSettings, UserRole } from "@/lib/types";
import { deriveRetailFromCost, deriveWholesaleFromRetail, type PricingTier } from "@/lib/pricing-engine";

const FONT_OPTIONS = [
  { label: "Cairo", value: "Cairo" },
  { label: "Tajawal", value: "Tajawal" },
  { label: "Almarai", value: "Almarai" },
  { label: "IBM Plex Sans Arabic", value: "IBM Plex Sans Arabic" },
  { label: "Noto Sans Arabic", value: "Noto Sans Arabic" },
  { label: "Cairo (نظام)", value: "Arial, sans-serif" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "مدير النظام",
  admin: "إداري",
  customer: "زبون",
};

const ROLE_COLORS: Record<UserRole, { bg: string; border: string }> = {
  manager: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
  admin: { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
  customer: { bg: "bg-pink-50 dark:bg-pink-900/20", border: "border-pink-200 dark:border-pink-800" },
};

function parseErrorMessage(err: unknown): string {
  if (!err) return "حدث خطأ غير معروف";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const obj = err as Record<string, any>;
    if (obj.message && typeof obj.message === "string") {
      return obj.details ? `${obj.message} (${obj.details})` : obj.message;
    }
    if (obj.error_description) return String(obj.error_description);
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export default function SettingsPage() {
  const { settings, updateSettings, loading } = useSettings();
  const { products, reloadAllData } = useData();
  const { logActivity } = useActivityLog();
  const { user, loading: authLoading } = useAuth();
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Local draft state for explicit Save / Cancel controls
  const [formData, setFormData] = useState<SiteSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Bulk Pricing Batch & Revert State
  const [bulkBatching, setBulkBatching] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [bulkBatchResult, setBulkBatchResult] = useState<string | null>(null);
  const [backupSnapshot, setBackupSnapshot] = useState<{
    timestamp: string;
    itemsCount: number;
    previousPrices: Array<{ id: string; retailPrice: number; wholesalePrice: number }>;
  } | null>(null);

  // ── Inquiries Management State ───────────────────────────────────────────────
  const [inquiries, setInquiries] = useState<Array<{ id: string; category: string; question: string; answer: string; keywords: string[]; sort_order: number; is_active: boolean }>>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [inqSearch, setInqSearch] = useState("");
  const [inqSearchDebounced, setInqSearchDebounced] = useState(""); // 300ms debounced
  const [inqEditId, setInqEditId] = useState<string | null>(null);
  const [inqForm, setInqForm] = useState({ category: "", question: "", answer: "", keywords: "", sort_order: 0 });
  const [inqSaving, setInqSaving] = useState(false);
  const [inqSelected, setInqSelected] = useState<Set<string>>(new Set());
  const [inqToast, setInqToast] = useState<string | null>(null);

  // ── Auto-Reply Management State ───────────────────────────────────────────────
  const [autoReplies, setAutoReplies] = useState<Array<{ id: string; trigger_keywords: string[]; response_text: string; match_threshold: number; is_active: boolean; priority: number }>>([]);
  const [autoRepliesLoading, setAutoRepliesLoading] = useState(false);
  const [arEditId, setArEditId] = useState<string | null>(null);
  const [arForm, setArForm] = useState({ trigger_keywords: "", response_text: "", match_threshold: 0.90, priority: 0 });
  const [arSaving, setArSaving] = useState(false);
  const [arSelected, setArSelected] = useState<Set<string>>(new Set());
  const [arToast, setArToast] = useState<string | null>(null);
  const [arGlobalEnabled, setArGlobalEnabled] = useState(false);
  const [arGlobalThreshold, setArGlobalThreshold] = useState(0.90);
  const [arFallback, setArFallback] = useState("شكراً لتواصلك معنا! سيتم الرد عليك من قبل فريقنا في أقرب وقت.");
  const [arSettingsSaving, setArSettingsSaving] = useState(false);

  // Restore undo snapshot backup from localStorage if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedBackup = localStorage.getItem("bulk_pricing_undo_backup");
        if (savedBackup) {
          const parsed = JSON.parse(savedBackup);
          if (parsed && parsed.previousPrices && parsed.previousPrices.length > 0) {
            setBackupSnapshot(parsed);
          }
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Sync draft state when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Debounce inquiries search — 300ms to prevent excessive re-renders
  useEffect(() => {
    const timer = setTimeout(() => setInqSearchDebounced(inqSearch), 300);
    return () => clearTimeout(timer);
  }, [inqSearch]);

  // Load inquiries and auto-reply rules
  useEffect(() => {
    async function loadInquiries() {
      setInquiriesLoading(true);
      const { data } = await supabase.from("inquiries").select("*").order("sort_order");
      if (data) setInquiries(data as any[]);
      setInquiriesLoading(false);
    }
    async function loadAutoReplies() {
      setAutoRepliesLoading(true);
      const { data } = await supabase.from("auto_replies").select("*").order("priority", { ascending: false });
      if (data) setAutoReplies(data as any[]);
      setAutoRepliesLoading(false);
    }
    async function loadArSettings() {
      const { data } = await supabase.from("settings").select("auto_reply_enabled,auto_reply_threshold,auto_reply_fallback").limit(1).single();
      if (data) {
        setArGlobalEnabled(data.auto_reply_enabled ?? false);
        setArGlobalThreshold(data.auto_reply_threshold ?? 0.90);
        setArFallback(data.auto_reply_fallback ?? "شكراً لتواصلك معنا!");
      }
    }
    loadInquiries();
    loadAutoReplies();
    loadArSettings();
  }, []);

  const showInqToast = (msg: string) => { setInqToast(msg); setTimeout(() => setInqToast(null), 3000); };
  const showArToast  = (msg: string) => { setArToast(msg);  setTimeout(() => setArToast(null),  3000); };

  const saveInquiry = async () => {
    if (!inqForm.question.trim() || !inqForm.answer.trim()) return;
    setInqSaving(true);
    const payload = { category: inqForm.category || "عام", question: inqForm.question.trim(), answer: inqForm.answer.trim(), keywords: inqForm.keywords ? inqForm.keywords.split(",").map(k => k.trim()).filter(Boolean) : [], sort_order: inqForm.sort_order, updated_at: new Date().toISOString() };
    if (inqEditId) {
      await supabase.from("inquiries").update(payload).eq("id", inqEditId);
      setInquiries(prev => prev.map(i => i.id === inqEditId ? { ...i, ...payload } : i));
      showInqToast("✅ تم تحديث الاستفسار");
    } else {
      const { data } = await supabase.from("inquiries").insert({ ...payload, is_active: true }).select().single();
      if (data) setInquiries(prev => [data as any, ...prev]);
      showInqToast("✅ تم إضافة استفسار جديد");
    }
    setInqEditId(null);
    setInqForm({ category: "", question: "", answer: "", keywords: "", sort_order: 0 });
    setInqSaving(false);
  };

  const deleteInquiry = async (id: string) => {
    await supabase.from("inquiries").delete().eq("id", id);
    setInquiries(prev => prev.filter(i => i.id !== id));
    showInqToast("✅ تم حذف الاستفسار");
  };

  const bulkDeleteInquiries = async () => {
    if (inqSelected.size === 0 || !confirm(`حذف ${inqSelected.size} استفسارات؟`)) return;
    const ids = [...inqSelected];
    await supabase.from("inquiries").delete().in("id", ids);
    setInquiries(prev => prev.filter(i => !ids.includes(i.id)));
    setInqSelected(new Set());
    showInqToast(`✅ تم حذف ${ids.length} استفسار`);
  };

  const exportInquiries = () => {
    const blob = new Blob([JSON.stringify(inquiries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "inquiries.json"; a.click();
  };

  const importInquiries = async (file: File) => {
    try {
      const text = await file.text();
      const items = JSON.parse(text);
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const { id, created_at, updated_at, ...rest } = item;
        await supabase.from("inquiries").insert({ ...rest, is_active: true });
      }
      const { data } = await supabase.from("inquiries").select("*").order("sort_order");
      if (data) setInquiries(data as any[]);
      showInqToast("✅ تم استيراد الاستفسارات بنجاح");
    } catch { showInqToast("❌ خطأ في قراءة الملف"); }
  };

  const saveAutoReply = async () => {
    if (!arForm.response_text.trim() || !arForm.trigger_keywords.trim()) return;
    setArSaving(true);
    const payload = { trigger_keywords: arForm.trigger_keywords.split(",").map(k => k.trim()).filter(Boolean), response_text: arForm.response_text.trim(), match_threshold: arForm.match_threshold, priority: arForm.priority, updated_at: new Date().toISOString() };
    if (arEditId) {
      await supabase.from("auto_replies").update(payload).eq("id", arEditId);
      setAutoReplies(prev => prev.map(r => r.id === arEditId ? { ...r, ...payload } : r));
      showArToast("✅ تم تحديث الرد التلقائي");
    } else {
      const { data } = await supabase.from("auto_replies").insert({ ...payload, is_active: true }).select().single();
      if (data) setAutoReplies(prev => [data as any, ...prev]);
      showArToast("✅ تم إضافة قاعدة جديدة");
    }
    setArEditId(null);
    setArForm({ trigger_keywords: "", response_text: "", match_threshold: 0.90, priority: 0 });
    setArSaving(false);
  };

  const toggleAutoReplyActive = async (id: string, current: boolean) => {
    await supabase.from("auto_replies").update({ is_active: !current }).eq("id", id);
    setAutoReplies(prev => prev.map(r => r.id === id ? { ...r, is_active: !current } : r));
  };

  const deleteAutoReply = async (id: string) => {
    await supabase.from("auto_replies").delete().eq("id", id);
    setAutoReplies(prev => prev.filter(r => r.id !== id));
    showArToast("✅ تم حذف القاعدة");
  };

  const bulkDeleteAutoReplies = async () => {
    if (arSelected.size === 0 || !confirm(`حذف ${arSelected.size} قواعد؟`)) return;
    const ids = [...arSelected];
    await supabase.from("auto_replies").delete().in("id", ids);
    setAutoReplies(prev => prev.filter(r => !ids.includes(r.id)));
    setArSelected(new Set());
    showArToast(`✅ تم حذف ${ids.length} قواعد`);
  };

  const exportAutoReplies = () => {
    const blob = new Blob([JSON.stringify(autoReplies, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "auto_replies.json"; a.click();
  };

  const importAutoReplies = async (file: File) => {
    try {
      const text = await file.text();
      const items = JSON.parse(text);
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const { id, created_at, updated_at, ...rest } = item;
        await supabase.from("auto_replies").insert({ ...rest, is_active: true });
      }
      const { data } = await supabase.from("auto_replies").select("*").order("priority", { ascending: false });
      if (data) setAutoReplies(data as any[]);
      showArToast("✅ تم استيراد القواعد بنجاح");
    } catch { showArToast("❌ خطأ في قراءة الملف"); }
  };

  const saveArGlobalSettings = async () => {
    setArSettingsSaving(true);
    try {
      // Use a subquery to get the first settings row id, since SiteSettings type has no id field
      const { data: settingsRow } = await supabase.from("settings").select("id").limit(1).single();
      if (settingsRow?.id) {
        await supabase.from("settings").update({ auto_reply_enabled: arGlobalEnabled, auto_reply_threshold: arGlobalThreshold, auto_reply_fallback: arFallback }).eq("id", settingsRow.id);
      }
      showArToast("✅ تم حفظ إعدادات الردود التلقائية");
    } catch { showArToast("❌ خطأ في الحفظ"); }
    setArSettingsSaving(false);
  };

  // 🔒 Route Protection: If user is a Customer or Guest, block access to System Settings (403 Unauthorized)
  if (!authLoading && user && (user.role === "customer" || user.isGuest || user.id.startsWith("guest-"))) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 border border-red-200 dark:border-red-900/60 shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/80 rounded-2xl border border-red-300 dark:border-red-800 flex items-center justify-center text-3xl mx-auto shadow-sm">
            ⛔
          </div>

          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white">
            غير مصرح لك بدخول هذه الصفحة (403 Access Denied)
          </h2>

          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            صفحة إعدادات الهوية والبنية التحتية للمتجر مخصصة حصراً لمدراء النظام والإداريين. بصفتك زبون، يمكنك تعديل معلومات ملفك الشخصي بكل سهولة.
          </p>

          <div className="pt-3 space-y-2">
            <button
              onClick={() => setProfileModalOpen(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>👤</span>
              <span>تعديل الملف الشخصي والمعلومات</span>
            </button>

            <Link
              href="/"
              className="w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm transition-colors block text-center"
            >
              العودة للمتجر الرئيسي 🏠
            </Link>
          </div>

          <ProfileEditModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
        </div>
      </div>
    );
  }

  const handleChange = (fields: Partial<SiteSettings>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
    setSavedSuccess(false);
  };

  const handleRoleThemeChange = (role: UserRole, themeUpdates: Partial<SiteSettings["roleThemes"][UserRole]>) => {
    setFormData((prev) => ({
      ...prev,
      roleThemes: {
        ...prev.roleThemes,
        [role]: {
          ...prev.roleThemes[role],
          ...themeUpdates,
        },
      },
    }));
    setSavedSuccess(false);
  };

  // Check if form has unsaved changes
  const isDirty = JSON.stringify(formData) !== JSON.stringify(settings);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateSettings(formData);
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "إعدادات الموقع",
        details: "حفظ وتحديث إعدادات الموقع، الصور، الثيمات والموقع الجغرافي بالكامل",
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: unknown) {
      console.error("[Settings Save Failure Details]:", err);
      const detailedMessage = parseErrorMessage(err);
      setErrorMsg(`تعذر حفظ الإعدادات في قاعدة البيانات: ${detailedMessage}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Bulk Pricing Execution & Revert Safety Mechanism ───────────────────
  const handleApplyBulkPricing = async () => {
    if (!products || products.length === 0) return;

    const markupPct = formData.importMarkupPct ?? 10;
    const reductionPct = formData.importWholesaleReductionPct ?? 10;

    // Filter products that have a valid cost price or retail price to work from
    const eligibleProducts = products.filter(
      (p) => Number(p.costPrice) > 0 || Number(p.retailPrice) > 0
    );

    if (eligibleProducts.length === 0) {
      alert("لا توجد منتجات تحتوي على أسعار لتطبيق الحساب التلقائي عليها.");
      return;
    }

    const confirmRun = window.confirm(
      `هل أنت متأكد من تطبيق الأسعار التلقائية على ${eligibleProducts.length} منتج؟\n\n` +
      `• سعر المفرد الجديد = التكلفة × (1 + ${markupPct}%)\n` +
      `• سعر الجملة الجديد = سعر المفرد الجديد × (1 - ${reductionPct}%)\n\n` +
      `سيتم حفظ نسخة احتياطية لإمكانية التراجع فوراً في أي وقت!`
    );
    if (!confirmRun) return;

    setBulkBatching(true);
    setBulkBatchResult(null);
    try {
      // 1. Take a safety snapshot BEFORE modifying database
      const snapshot = {
        timestamp: new Date().toISOString(),
        itemsCount: eligibleProducts.length,
        previousPrices: eligibleProducts.map((p) => ({
          id: p.id,
          retailPrice: p.retailPrice,
          wholesalePrice: p.wholesalePrice,
        })),
      };

      setBackupSnapshot(snapshot);
      if (typeof window !== "undefined") {
        localStorage.setItem("bulk_pricing_undo_backup", JSON.stringify(snapshot));
      }

      // 2. Strict calculation sequence: Step 1 Retail -> Step 2 Wholesale
      const updates = eligibleProducts.map((p) => {
        const costPrice = Number(p.costPrice) > 0
          ? Number(p.costPrice)
          : Math.round(Number(p.retailPrice) / (1 + markupPct / 100));

        // Step 1: Calculate new Retail Price strictly using markup percentage
        const newRetail = deriveRetailFromCost(costPrice, markupPct);

        // Step 2: Calculate new Wholesale Price strictly using reduction percentage on the NEW retail price
        const newWholesale = deriveWholesaleFromRetail(newRetail, reductionPct);

        return {
          id: p.id,
          retail_price: newRetail,       // -> mapped to retail_price column
          wholesale_price: newWholesale, // -> mapped to wholesale_price column
        };
      });

      // 3. Batch update Supabase products table in parallel chunks of 20
      const batchSize = 20;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((item) =>
            supabase
              .from("products")
              .update({
                retail_price: item.retail_price,
                wholesale_price: item.wholesale_price,
              })
              .eq("id", item.id)
          )
        );

        for (const res of results) {
          if (res.error) throw res.error;
        }
      }

      // 4. Reload store data from DB
      await reloadAllData();

      // 5. Validation Check: Ensure no updated product's retail price remains equal to cost price
      const updatedProducts = products.filter((p) => updates.some((u) => u.id === p.id));
      const equalCostRetailCount = updatedProducts.filter(
        (p) => p.costPrice > 0 && Math.abs(p.retailPrice - p.costPrice) < 0.01
      ).length;

      if (equalCostRetailCount > 0) {
        console.warn(`[Validation Notice]: ${equalCostRetailCount} products have retail price equal to cost price.`);
      }

      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "المنتجات - تسعير تلقائي دفعة واحدة",
        details: `تم تطبيق الأسعار التلقائية على ${eligibleProducts.length} منتج بنسبة ربح ${markupPct}% وخصم جملة ${reductionPct}%`,
      });

      setBulkBatchResult(
        `تم تحديث أسعار ${eligibleProducts.length} منتج بنجاح! (المفرد = التكلفة + ${markupPct}% | الجملة = المفرد - ${reductionPct}%). يمكنك التراجع في أي وقت.`
      );
    } catch (err: unknown) {
      const msg = parseErrorMessage(err);
      console.error("Bulk pricing execution failed:", err);
      alert(`فشل تطبيق الأسعار الدفعية: ${msg}`);
    } finally {
      setBulkBatching(false);
    }
  };

  const handleRevertBulkPricing = async () => {
    if (!backupSnapshot || !backupSnapshot.previousPrices || backupSnapshot.previousPrices.length === 0) return;

    const confirmRevert = window.confirm(
      `هل أنت متأكد من التراجع عن آخر عملية تطبيق للأسعار التلقائية وإعادة أسعار ${backupSnapshot.previousPrices.length} منتج إلى حالتها السابقة؟`
    );
    if (!confirmRevert) return;

    setReverting(true);
    setBulkBatchResult(null);
    try {
      const revertRows = backupSnapshot.previousPrices.map((item) => ({
        id: item.id,
        retail_price: item.retailPrice,
        wholesale_price: item.wholesalePrice,
      }));

      const batchSize = 20;
      for (let i = 0; i < revertRows.length; i += batchSize) {
        const batch = revertRows.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((item) =>
            supabase
              .from("products")
              .update({
                retail_price: item.retail_price,
                wholesale_price: item.wholesale_price,
              })
              .eq("id", item.id)
          )
        );

        for (const res of results) {
          if (res.error) throw res.error;
        }
      }

      await reloadAllData();
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "المنتجات - التراجع عن التسعير التلقائي",
        details: `تم التراجع عن أحدث عملية تطبيق للأسعار التلقائية وإعادة أسعار ${revertRows.length} منتج إلى حالتها السابقة.`,
      });

      setBulkBatchResult(`تم التراجع عن أحدث عملية تطبيق وإعادة أسعار ${revertRows.length} منتج إلى حالتها السابقة بنجاح.`);
      setBackupSnapshot(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("bulk_pricing_undo_backup");
      }
    } catch (err: unknown) {
      const msg = parseErrorMessage(err);
      console.error("Revert bulk pricing failed:", err);
      alert(`فشل التراجع عن الأسعار: ${msg}`);
    } finally {
      setReverting(false);
    }
  };

  const handleCancel = () => {
    setFormData(settings);
    setSavedSuccess(false);
    setErrorMsg(null);
  };

  const isManagerOrAdmin = settings.currentRole === "manager" || settings.currentRole === "admin";

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 dark:text-gray-400">
        <span className="text-3xl animate-spin block mb-2">🔄</span>
        <p>جاري تحميل الإعدادات...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl w-full pb-28" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إعدادات النظام والشكل العام</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">تخصيص الهوية، الثيمات، الموقع الجغرافي، وسوشيال ميديا المتجر</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setProfileModalOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <span>👤</span>
            <span>تعديل الملف الشخصي والمعلومات الأمنيّة</span>
          </button>

          {isDirty && (
            <span className="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold rounded-full animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              توجد تغييرات غير محفوظة!
            </span>
          )}
        </div>
      </div>

      {/* Notifications Banners */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-sm font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <span>تم حفظ جميع التغييرات والإعدادات بنجاح وتطبيقها فوراً لجميع المستخدمين!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)} className="text-emerald-600 hover:text-emerald-800 text-xs">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-2xl flex items-center justify-between text-red-800 dark:text-red-300 text-sm font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-600 hover:text-red-800 text-xs font-bold">✕</button>
        </div>
      )}

      {/* === Section 1: Branding Images === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🖼️</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">الشعار وصور الهوية البصرية</h2>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">
            اسم الموقع والمتجر
          </label>
          <input
            type="text"
            value={formData.siteName}
            onChange={(e) => handleChange({ siteName: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ImageUploader
            label="الشعار الرسمي (Logo)"
            image={formData.logo}
            onUpload={(img) => handleChange({ logo: img })}
            aspect="aspect-square"
          />
          <ImageUploader
            label="صورة الواجهة (Hero Header)"
            image={formData.heroImage}
            onUpload={(img) => handleChange({ heroImage: img })}
          />
          <ImageUploader
            label="صورة تذييل الصفحة (Footer Image)"
            image={formData.footerImage}
            onUpload={(img) => handleChange({ footerImage: img })}
          />
        </div>
      </section>

      {/* === Section 2: Advanced Theme Customizer === */}
      <ThemeCustomizer />

      {/* === Section 3: Store Location & Maps === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📍</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">إدارة الموقع الجغرافي وخريطة المعرض</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">تحديد عنوان الموقع ورابط خرائط Google Maps المعروض للزبائن في القائمة</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
              عنوان المعرض / المحل التفصيلي:
            </label>
            <input
              type="text"
              placeholder="مثال: العراق - بغداد - الشارع التجاري الرئيسي"
              value={formData.storeAddress || ""}
              onChange={(e) => handleChange({ storeAddress: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
              رابط الموقع المباشر في Google Maps:
            </label>
            <input
              type="text"
              placeholder="https://maps.google.com/..."
              value={formData.storeMapLink || ""}
              onChange={(e) => handleChange({ storeMapLink: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none"
            />
          </div>
        </div>
      </section>

      {/* === Section 4: Contact & Social Media Channels === */}
      {isManagerOrAdmin && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🌐</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">روابط الاتصال وصفحات السوشيال ميديا الرسمية</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">ربط قنوات الاتصال برقم ثانوي وصفحات الفيسبوك والانستغرام والتيك توك</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">💬 الواتساب الرئيسية:</label>
              <input
                type="text"
                placeholder="07800000000"
                value={formData.whatsappLink || ""}
                onChange={(e) => handleChange({ whatsappLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">📞 الهاتف الرئيسي:</label>
              <input
                type="text"
                placeholder="07800000000"
                value={formData.phoneLink || ""}
                onChange={(e) => handleChange({ phoneLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">☎️ الهاتف الثانوي:</label>
              <input
                type="text"
                placeholder="07700000000"
                value={formData.phoneLink2 || ""}
                onChange={(e) => handleChange({ phoneLink2: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">📘 صفحة Facebook:</label>
              <input
                type="text"
                placeholder="https://facebook.com/..."
                value={formData.facebookLink || ""}
                onChange={(e) => handleChange({ facebookLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">📸 حساب Instagram:</label>
              <input
                type="text"
                placeholder="https://instagram.com/..."
                value={formData.instagramLink || ""}
                onChange={(e) => handleChange({ instagramLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🎵 حساب TikTok:</label>
              <input
                type="text"
                placeholder="https://tiktok.com/@..."
                value={formData.tiktokLink || ""}
                onChange={(e) => handleChange({ tiktokLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
              />
            </div>
          </div>
        </section>
      )}

      {/* === Section 5: Mobile App Share Download Links === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📲</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">إعدادات رابط مشاركة وتطبيقات الهاتف الذكي</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">تخصيص روابط التحميل المباشر لتطبيق Android و iOS المعروضة عند استخدام زر المشاركة</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🤖 رابط تطبيق Android (APK / Play Store):</label>
            <input
              type="text"
              placeholder="https://play.google.com/..."
              value={formData.androidAppUrl || ""}
              onChange={(e) => handleChange({ androidAppUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🍎 رابط تطبيق iOS (App Store):</label>
            <input
              type="text"
              placeholder="https://apps.apple.com/..."
              value={formData.iosAppUrl || ""}
              onChange={(e) => handleChange({ iosAppUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">🔗 رابط تحميل عام المباشر:</label>
            <input
              type="text"
              placeholder="https://example.com/app.apk"
              value={formData.appDownloadUrl || ""}
              onChange={(e) => handleChange({ appDownloadUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-xs"
            />
          </div>
        </div>
      </section>

      {/* === Section 6: Categories Management === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📁</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">إدارة وتخصيص أقسام المنتجات</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">إضافة صور وأسماء الأقسام، ترتيب أولوية الظهور، وتفعيل/تعطيل الشريط المتحرك</p>
          </div>
        </div>
        <CategoriesManager />
      </section>

      {/* === Section 7: Automated Watermark Tool === */}
      <WatermarkSettings />

      {/* === Section 7b: Pricing Tiers Engine Dashboard === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-200 dark:border-indigo-800/40 p-6 space-y-6 shadow-sm" dir="rtl">
        <div className="flex items-center gap-3 border-b border-indigo-100 dark:border-indigo-800/30 pb-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl text-white shadow-md flex-shrink-0">
            🏷️
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">محرك الأسعار والتسعير المتدرج</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">إعداد حدود الكميات ونسب الخصم العالمية لجميع المنتجات</p>
          </div>
        </div>

        {/* Import Auto-Calculation Settings */}
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800/40 space-y-3">
          <p className="text-sm font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-2">📥 إعدادات الحساب التلقائي عند الاستيراد</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                نسبة الربح على التكلفة (حساب سعر المفرد)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={500} step={1}
                  value={formData.importMarkupPct ?? 10}
                  onChange={(e) => handleChange({ importMarkupPct: parseFloat(e.target.value) || 10 })}
                  className="w-24 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm font-extrabold text-amber-700 dark:text-amber-300 outline-none focus:border-amber-500"
                />
                <span className="text-sm font-bold text-amber-700 dark:text-amber-300">%</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">سعر المفرد = التكلفة × (1 + {formData.importMarkupPct ?? 10}%)</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                نسبة خصم الجملة من المفرد (حساب سعر الجملة)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={99} step={1}
                  value={formData.importWholesaleReductionPct ?? 10}
                  onChange={(e) => handleChange({ importWholesaleReductionPct: parseFloat(e.target.value) || 10 })}
                  className="w-24 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm font-extrabold text-emerald-700 dark:text-emerald-300 outline-none focus:border-amber-500"
                />
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">%</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">الجملة = المفرد × (1 − {formData.importWholesaleReductionPct ?? 10}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Bulk Pricing Action & Revert Safety Panel ─── */}
        <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-4 border border-indigo-700/50">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">تطبيق الأسعار التلقائية على جميع المنتجات الحالية</h3>
                <p className="text-xs text-indigo-200 mt-0.5">
                  تحديث أسعار المفرد والجملة لجميع المنتجات دفعة واحدة بناءً على نسبة الربح ({formData.importMarkupPct ?? 10}%) ونسبة الخصم ({formData.importWholesaleReductionPct ?? 10}%)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/10 flex-wrap gap-3">
            <button
              onClick={handleApplyBulkPricing}
              disabled={bulkBatching || products.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
            >
              <span>🚀</span>
              <span>{bulkBatching ? "جارٍ تطبيق الأسعار على جميع المنتجات..." : "تطبيق الأسعار التلقائية على جميع المنتجات"}</span>
            </button>

            {/* Revert / Undo Button — active whenever a backup snapshot exists */}
            {backupSnapshot && (
              <button
                onClick={handleRevertBulkPricing}
                disabled={reverting}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99] animate-pulse"
              >
                <span>↩️</span>
                <span>{reverting ? "جارٍ التراجع عن الأسعار..." : `تراجع عن آخر عملية تطبيق (${backupSnapshot.itemsCount} منتج)`}</span>
              </button>
            )}
          </div>

          {/* Status / Success Banner */}
          {bulkBatchResult && (
            <div className="p-3 bg-white/10 rounded-xl text-xs font-bold text-emerald-200 flex items-center justify-between border border-emerald-500/30">
              <span>✅ {bulkBatchResult}</span>
              <button onClick={() => setBulkBatchResult(null)} className="text-white/60 hover:text-white px-1">✕</button>
            </div>
          )}
        </div>

        {/* Global Tier Boundaries Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold text-gray-700 dark:text-gray-200">🎯 جدول مستويات الخصم العالمي</p>
            <button
              onClick={() => {
                const currentTiers = (formData.pricingTiers?.tiers ?? []);
                const lastTier = currentTiers[currentTiers.length - 1];
                const newMin = lastTier ? lastTier.minQty + 10 : 2;
                handleChange({
                  pricingTiers: {
                    mode: "percentage",
                    tiers: [
                      ...currentTiers,
                      { label: `جملة ${currentTiers.length}`, minQty: newMin, maxQty: newMin + 9, discountPct: 0 }
                    ]
                  }
                });
              }}
              className="px-3 py-1.5 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-xl hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
            >
              + إضافة مستوى
            </button>
          </div>

          {/* Tier Editor Table */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-5 gap-0 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-[11px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
              <span>المستوى</span>
              <span className="text-center">من (قطعة)</span>
              <span className="text-center">إلى (قطعة)</span>
              <span className="text-center">خصم %</span>
              <span className="text-center">إجراء</span>
            </div>

            {(formData.pricingTiers?.tiers ?? []).map((tier, idx) => (
              <div key={idx} className={`grid grid-cols-5 gap-2 items-center px-4 py-3 ${idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/50"} ${idx > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""}`}>
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => {
                    const tiers = [...(formData.pricingTiers?.tiers ?? [])];
                    tiers[idx] = { ...tiers[idx], label: e.target.value };
                    handleChange({ pricingTiers: { mode: "percentage", tiers } });
                  }}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
                <input
                  type="number" min={1}
                  value={tier.minQty}
                  onChange={(e) => {
                    const tiers = [...(formData.pricingTiers?.tiers ?? [])];
                    tiers[idx] = { ...tiers[idx], minQty: parseInt(e.target.value) || 1 };
                    handleChange({ pricingTiers: { mode: "percentage", tiers } });
                  }}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-center text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
                <input
                  type="number" min={tier.minQty}
                  value={tier.maxQty >= 99999 ? "" : tier.maxQty}
                  placeholder="∞"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    const tiers = [...(formData.pricingTiers?.tiers ?? [])];
                    tiers[idx] = { ...tiers[idx], maxQty: isNaN(v) ? 99999 : v };
                    handleChange({ pricingTiers: { mode: "percentage", tiers } });
                  }}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-center text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
                <input
                  type="number" min={0} max={99} step={0.5}
                  value={tier.discountPct}
                  onChange={(e) => {
                    const tiers = [...(formData.pricingTiers?.tiers ?? [])];
                    tiers[idx] = { ...tiers[idx], discountPct: parseFloat(e.target.value) || 0 };
                    handleChange({ pricingTiers: { mode: "percentage", tiers } });
                  }}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-center text-red-600 dark:text-red-400 outline-none focus:border-indigo-500"
                />
                <div className="flex justify-center">
                  {idx > 0 && (
                    <button
                      onClick={() => {
                        const tiers = [...(formData.pricingTiers?.tiers ?? [])];
                        tiers.splice(idx, 1);
                        handleChange({ pricingTiers: { mode: "percentage", tiers } });
                      }}
                      className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs flex items-center justify-center hover:bg-red-200 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            💡 المستوى الأول (مفرد) هو السعر الأساسي بدون خصم. المستويات التالية تطبق خصماً نسبياً على السعر الأساسي.
          </p>
        </div>

        {/* Save Button for Pricing Section */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-8 py-2.5 rounded-xl font-extrabold text-sm text-white transition-all shadow-md ${
              savedSuccess ? "bg-emerald-600" : saving ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:scale-[1.02]"
            }`}
          >
            {savedSuccess ? "✅ تم الحفظ" : saving ? "جارٍ الحفظ..." : "💾 حفظ إعدادات التسعير"}
          </button>
        </div>
      </section>

      {/* === Section 8: Appearance & Fonts === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">✏️</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">تخصيص المظهر والخطوط</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
              نوع الخط
            </label>
            <select
              value={formData.fontFamily}
              onChange={(e) => handleChange({ fontFamily: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              style={{ fontFamily: formData.fontFamily }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
              حجم الخط الأساسي: {formData.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={formData.fontSize}
              onChange={(e) => handleChange({ fontSize: Number(e.target.value) })}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>12px</span>
              <span>18px</span>
              <span>24px</span>
            </div>
          </div>
        </div>
      </section>

      {/* === Section 9: Colors & Dark Mode === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🎯</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">الألوان العامة والوضع المظلم</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ColorPicker
            label="اللون الأساسي"
            color={formData.primaryColor}
            onChange={(c) => handleChange({ primaryColor: c })}
          />
          <ColorPicker
            label="اللون الثانوي"
            color={formData.secondaryColor}
            onChange={(c) => handleChange({ secondaryColor: c })}
          />
          <ColorPicker
            label="لون التمييز"
            color={formData.accentColor}
            onChange={(c) => handleChange({ accentColor: c })}
          />
        </div>

        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">الوضع المظلم (Dark Mode)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">تبديل ثيم المظهر بين المضيء (النهاري) والمظلم (الليلي)</p>
          </div>
          <button
            onClick={() => handleChange({ darkMode: !formData.darkMode })}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              formData.darkMode ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-xs ${
                formData.darkMode ? "right-0.5" : "right-7"
              }`}
            >
              {formData.darkMode ? "🌙" : "☀️"}
            </div>
          </button>
        </div>

        {/* Eye Protection Toggle */}
        <div className="flex items-center justify-between p-4 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
          <div>
            <h3 className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <span>👁️</span>
              <span>وضع حماية العين (Eye Protection / Warm Sepia Filter)</span>
            </h3>
            <p className="text-xs text-amber-700/80 dark:text-amber-400">
              مرشح إضاءة دافئ مريح للعين يقلل الإشعاع الأزرق مع إمكانية الدمج مع الوضع الليلي أو النهاري
            </p>
          </div>
          <button
            onClick={() => handleChange({ eyeProtection: !formData.eyeProtection })}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              formData.eyeProtection ? "bg-amber-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-xs ${
                formData.eyeProtection ? "right-0.5" : "right-7"
              }`}
            >
              {formData.eyeProtection ? "👁️" : "⚪"}
            </div>
          </button>
        </div>
      </section>

      {/* === Section 10: Delivery Settings === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🚚</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">إعدادات التوصيل والشحن الافتراضية</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
              تكلفة التوصيل الافتراضية (د.ع)
            </label>
            <input
              type="number"
              value={formData.defaultDeliveryFee ?? 5000}
              onChange={(e) => handleChange({ defaultDeliveryFee: Number(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="5000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
              مدة التوصيل المتوقعة
            </label>
            <input
              type="text"
              value={formData.defaultDeliveryDuration ?? "2 - 3 أيام عمل"}
              onChange={(e) => handleChange({ defaultDeliveryDuration: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="مثال: 2 - 3 أيام عمل / توصيل سريع"
            />
          </div>
        </div>
      </section>

      {/* === Section 11: Role Themes === */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">👤</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">تخصيص ثيمات الأدوار</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["manager", "admin", "customer"] as UserRole[]).map((role) => {
            const colors = ROLE_COLORS[role];
            const currentRoleTheme = formData.roleThemes[role];
            return (
              <div
                key={role}
                className={`rounded-2xl border-2 p-5 space-y-4 ${colors.bg} ${colors.border}`}
              >
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                  <div
                    className="w-3.5 h-3.5 rounded-full shadow-sm"
                    style={{ backgroundColor: currentRoleTheme.primary }}
                  />
                  {ROLE_LABELS[role]}
                </h3>

                <ColorPicker
                  label="الأساسي"
                  color={currentRoleTheme.primary}
                  onChange={(c) => handleRoleThemeChange(role, { primary: c })}
                />
                <ColorPicker
                  label="الثانوي"
                  color={currentRoleTheme.secondary}
                  onChange={(c) => handleRoleThemeChange(role, { secondary: c })}
                />
                <ColorPicker
                  label="التمييز"
                  color={currentRoleTheme.accent}
                  onChange={(c) => handleRoleThemeChange(role, { accent: c })}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* === Sticky Action Bar at Bottom of Screen === */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-4 z-40 shadow-2xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4" dir="rtl">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
            {isDirty ? (
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                ⚠️ لديك تغييرات غير محفوظة
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                جميع الإعدادات مطابقة لآخر حفظ
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              disabled={!isDirty || saving}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              إلغاء التعديلات ❌
            </button>

            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg disabled:opacity-40 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              {saving ? (
                <>
                  <span className="animate-spin text-base">🔄</span>
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <span>حفظ التغييرات 💾</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          Section: Inquiries Management (إدارة الاستفسارات)
      ════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-5 shadow-sm">
        {inqToast && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold">{inqToast}</div>}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">إدارة الاستفسارات الجاهزة</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={exportInquiries} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 hover:bg-blue-100 transition-colors">⬇️ تصدير JSON</button>
            <label className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 transition-colors cursor-pointer">
              ⬆️ استيراد JSON
              <input type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) importInquiries(e.target.files[0]); }} />
            </label>
            {inqSelected.size > 0 && <button onClick={bulkDeleteInquiries} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-950/40 text-red-700 border border-red-200 dark:border-red-800/40 hover:bg-red-100 transition-colors">🗑️ حذف المحدد ({inqSelected.size})</button>}
          </div>
        </div>

        {/* Search */}
        <input type="text" placeholder="🔍 بحث في الاستفسارات..." value={inqSearch} onChange={(e) => setInqSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:border-violet-500" />

        {/* Add / Edit Form */}
        <div className="p-4 bg-violet-50/50 dark:bg-violet-950/20 rounded-2xl border border-violet-200 dark:border-violet-800/40 space-y-3">
          <p className="text-xs font-extrabold text-violet-800 dark:text-violet-300">{inqEditId ? "✏️ تعديل استفسار" : "➕ إضافة استفسار جديد"}</p>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="الفئة (مثال: طرق الشراء)" value={inqForm.category} onChange={(e) => setInqForm(p => ({ ...p, category: e.target.value }))}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-violet-500" />
            <input type="number" placeholder="ترتيب العرض" value={inqForm.sort_order} onChange={(e) => setInqForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-violet-500" />
          </div>
          <input placeholder="نص السؤال..." value={inqForm.question} onChange={(e) => setInqForm(p => ({ ...p, question: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-violet-500" />
          <textarea rows={3} placeholder="نص الإجابة..." value={inqForm.answer} onChange={(e) => setInqForm(p => ({ ...p, answer: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-violet-500 resize-none" />
          <input placeholder="كلمات مفتاحية (مفصولة بفاصلة)" value={inqForm.keywords} onChange={(e) => setInqForm(p => ({ ...p, keywords: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-violet-500" />
          <div className="flex gap-2">
            <button onClick={saveInquiry} disabled={inqSaving} className="flex-1 py-2 rounded-xl text-xs font-extrabold text-white bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 transition-colors">
              {inqSaving ? "جارٍ الحفظ..." : inqEditId ? "حفظ التعديلات" : "إضافة الاستفسار"}
            </button>
            {inqEditId && <button onClick={() => { setInqEditId(null); setInqForm({ category: "", question: "", answer: "", keywords: "", sort_order: 0 }); }} className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">إلغاء</button>}
          </div>
        </div>

        {/* Inquiries Table */}
        {inquiriesLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {inquiries.filter(i => !inqSearchDebounced || i.question.includes(inqSearchDebounced) || i.category.includes(inqSearchDebounced)).map(inq => (
              <div key={inq.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${inqSelected.has(inq.id) ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40"}`}>
                <input type="checkbox" checked={inqSelected.has(inq.id)} onChange={(e) => { const s = new Set(inqSelected); e.target.checked ? s.add(inq.id) : s.delete(inq.id); setInqSelected(s); }} className="mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">{inq.category}</span>
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{inq.question}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{inq.answer}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setInqEditId(inq.id); setInqForm({ category: inq.category, question: inq.question, answer: inq.answer, keywords: (inq.keywords || []).join(", "), sort_order: inq.sort_order }); }} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-xs">✏️</button>
                  <button onClick={() => deleteInquiry(inq.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-xs">🗑️</button>
                </div>
              </div>
            ))}
            {inquiries.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">لا توجد استفسارات بعد — أضف أول استفسار أعلاه</div>}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Section: Auto-Reply Engine (محرك الردود التلقائية)
      ════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-5 shadow-sm">
        {arToast && <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold">{arToast}</div>}

        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">محرك الردود التلقائية</h2>
        </div>

        {/* Global Settings Panel */}
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 space-y-4">
          <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">⚙️ الإعدادات العامة لمحرك الردود</p>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100">تفعيل الردود التلقائية</p>
              <p className="text-xs text-gray-400">عند التفعيل يرد النظام تلقائياً على رسائل الزبائن</p>
            </div>
            <button onClick={() => setArGlobalEnabled(!arGlobalEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${arGlobalEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${arGlobalEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">عتبة التشابه: {Math.round(arGlobalThreshold * 100)}%</label>
            </div>
            <input type="range" min={50} max={100} step={1} value={Math.round(arGlobalThreshold * 100)} onChange={(e) => setArGlobalThreshold(parseInt(e.target.value) / 100)}
              className="w-full accent-emerald-500" />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>50% (مرن)</span><span>75% (متوازن)</span><span>100% (صارم)</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">رسالة الرد الاحتياطي (عند عدم وجود تطابق):</label>
            <textarea rows={2} value={arFallback} onChange={(e) => setArFallback(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-emerald-500 resize-none" />
          </div>

          <button onClick={saveArGlobalSettings} disabled={arSettingsSaving} className="w-full py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 transition-colors">
            {arSettingsSaving ? "جارٍ الحفظ..." : "💾 حفظ إعدادات الردود التلقائية"}
          </button>
        </div>

        {/* Actions Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportAutoReplies} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 hover:bg-blue-100 transition-colors">⬇️ تصدير JSON</button>
          <label className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 transition-colors cursor-pointer">
            ⬆️ استيراد JSON
            <input type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) importAutoReplies(e.target.files[0]); }} />
          </label>
          {arSelected.size > 0 && <button onClick={bulkDeleteAutoReplies} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-950/40 text-red-700 border border-red-200 dark:border-red-800/40 hover:bg-red-100 transition-colors">🗑️ حذف المحدد ({arSelected.size})</button>}
        </div>

        {/* Add/Edit Rule Form */}
        <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-200 dark:border-indigo-800/40 space-y-3">
          <p className="text-xs font-extrabold text-indigo-800 dark:text-indigo-300">{arEditId ? "✏️ تعديل قاعدة" : "➕ إضافة قاعدة رد تلقائي"}</p>
          <input placeholder="كلمات مفتاحية للتشغيل (مفصولة بفاصلة)" value={arForm.trigger_keywords} onChange={(e) => setArForm(p => ({ ...p, trigger_keywords: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500" />
          <textarea rows={3} placeholder="نص الرد التلقائي..." value={arForm.response_text} onChange={(e) => setArForm(p => ({ ...p, response_text: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">عتبة التشابه: {Math.round(arForm.match_threshold * 100)}%</label>
              <input type="range" min={50} max={100} step={1} value={Math.round(arForm.match_threshold * 100)} onChange={(e) => setArForm(p => ({ ...p, match_threshold: parseInt(e.target.value) / 100 }))}
                className="w-full accent-indigo-500" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">الأولوية</label>
              <input type="number" value={arForm.priority} onChange={(e) => setArForm(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveAutoReply} disabled={arSaving} className="flex-1 py-2 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 transition-colors">
              {arSaving ? "جارٍ الحفظ..." : arEditId ? "حفظ التعديلات" : "إضافة القاعدة"}
            </button>
            {arEditId && <button onClick={() => { setArEditId(null); setArForm({ trigger_keywords: "", response_text: "", match_threshold: 0.90, priority: 0 }); }} className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">إلغاء</button>}
          </div>
        </div>

        {/* Auto-Reply Rules Table */}
        {autoRepliesLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {autoReplies.map(rule => (
              <div key={rule.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${arSelected.has(rule.id) ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20" : rule.is_active ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40" : "border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/20 opacity-60"}`}>
                <input type="checkbox" checked={arSelected.has(rule.id)} onChange={(e) => { const s = new Set(arSelected); e.target.checked ? s.add(rule.id) : s.delete(rule.id); setArSelected(s); }} className="mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {rule.trigger_keywords.map(kw => (<span key={kw} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">{kw}</span>))}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500">{Math.round(rule.match_threshold * 100)}%</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2">{rule.response_text}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0 items-start">
                  <button onClick={() => toggleAutoReplyActive(rule.id, rule.is_active)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${rule.is_active ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                    {rule.is_active ? "مفعّل" : "معطّل"}
                  </button>
                  <button onClick={() => { setArEditId(rule.id); setArForm({ trigger_keywords: rule.trigger_keywords.join(", "), response_text: rule.response_text, match_threshold: rule.match_threshold, priority: rule.priority }); }} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-xs">✏️</button>
                  <button onClick={() => deleteAutoReply(rule.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-xs">🗑️</button>
                </div>
              </div>
            ))}
            {autoReplies.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">لا توجد قواعد ردود تلقائية — أضف أول قاعدة أعلاه</div>}
          </div>
        )}
      </section>

      {/* Profile Edit Modal */}
      <ProfileEditModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </div>
  );
}
