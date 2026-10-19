"use client";

import { useState, useEffect, useMemo } from "react";
import { Product, Supplier } from "@/lib/types";
import { useData } from "@/lib/data-context";
import { useToast } from "@/components/ToastProvider";

interface SupplierContactModalProps {
  supplier: Supplier;
  productName: string;
  currentStock: number;
  productImage?: string;
  product?: Product;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * تنسيق رقم الهاتف للروابط المباشرة (WhatsApp / Telegram)
 * يحول الأرقام العراقية المحلية (077 / 078 / 079 / 075) تلقائياً إلى الصيغة الدولية 964
 */
function formatPhoneForDeepLink(phone?: string): string {
  if (!phone) return "";
  let digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("07") && digits.length === 11) {
    digits = "964" + digits.slice(1);
  } else if (digits.startsWith("7") && digits.length === 10) {
    digits = "964" + digits;
  }
  return digits;
}

export default function SupplierContactModal({
  supplier,
  productName,
  currentStock,
  productImage,
  product,
  isOpen,
  onClose,
}: SupplierContactModalProps) {
  const { products, hydrateProductImages } = useData();
  const { success, info, warning } = useToast();

  const [quantity, setQuantity] = useState("10");
  const [customMessage, setCustomMessage] = useState("");
  const [attachImage, setAttachImage] = useState(true);
  const [copied, setCopied] = useState(false);

  // جلب الصورة تلقائياً من السياق إذا تم تحميلها تدريجياً
  const liveProduct = useMemo(() => {
    if (product?.id) {
      return products.find((p) => p.id === product.id) || product;
    }
    return products.find((p) => p.name === productName) || product;
  }, [products, product, productName]);

  const resolvedImage = liveProduct?.image || productImage || "";

  useEffect(() => {
    if (isOpen && liveProduct?.id && !resolvedImage) {
      hydrateProductImages([liveProduct.id]);
    }
  }, [isOpen, liveProduct?.id, resolvedImage, hydrateProductImages]);

  // إغلاق النافذة عند الضغط على زر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // تجهيز رابط الصورة أو رابط المنتج القابل للمشاركة في الرسالة
  const shareableImageUrl = (() => {
    if (!attachImage || !resolvedImage) return "";
    if (resolvedImage.startsWith("http://") || resolvedImage.startsWith("https://")) {
      return resolvedImage;
    }
    if (typeof window !== "undefined") {
      if (resolvedImage.startsWith("/")) {
        return `${window.location.origin}${resolvedImage}`;
      }
      // في حال كانت الصورة بصيغة Base64، نرفق رابط معاينة المنتج المباشر في المتجر
      return `${window.location.origin}/?search=${encodeURIComponent(productName)}`;
    }
    return "";
  })();

  const baseAutoMessage =
    `مرحباً ${supplier.name}،\n\n` +
    `نود طلب تزويد شحنة جديدة للمنتج التالي:\n` +
    `• المنتج: ${productName}\n` +
    `• الكمية الحالية في المخزون: ${currentStock}\n` +
    `• الكمية المطلوبة للتزويد: ${quantity || "1"}\n` +
    (liveProduct?.barcode ? `• الباركود: ${liveProduct.barcode}\n` : "");

  const imageLine =
    attachImage && resolvedImage
      ? `\n🖼️ مرفق صورة/رابط المنتج:\n${shareableImageUrl}\n`
      : "\n";

  const finalMessage =
    (customMessage.trim() ? customMessage.trim() : baseAutoMessage.trim()) +
    imageLine +
    `\nبانتظار تأكيدكم، مع خالص الشكر والتقدير.`;

  const formattedIntlPhone = formatPhoneForDeepLink(supplier.phone);
  const rawPhone = (supplier.phone || "").trim();

  const copyMessageToClipboard = async (silent = false) => {
    try {
      await navigator.clipboard.writeText(finalMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (!silent) {
        success("تم نسخ نص الرسالة بالكامل إلى الحافظة");
      }
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDirectChannelClick = async (channelId: string) => {
    // نسخ الرسالة تلقائياً كضمان إضافي عند التحويل لأي تطبيق
    await copyMessageToClipboard(true);

    const encodedMsg = encodeURIComponent(finalMessage);
    const storeOrigin =
      typeof window !== "undefined" ? window.location.origin : "https://ahmedbahri.store";

    if (channelId === "whatsapp") {
      const waUrl = formattedIntlPhone
        ? `https://wa.me/${formattedIntlPhone}?text=${encodedMsg}`
        : `https://wa.me/?text=${encodedMsg}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (channelId === "telegram") {
      const tgUrl = formattedIntlPhone
        ? `https://t.me/+${formattedIntlPhone}?text=${encodedMsg}`
        : `https://t.me/share/url?url=${encodeURIComponent(
            shareableImageUrl || storeOrigin
          )}&text=${encodedMsg}`;
      info("تم تجهيز الرسالة وفتح تليجرام مباشرة");
      window.open(tgUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (channelId === "messenger") {
      info("تم نسخ تفاصيل الطلبية والصورة — الصقها مباشرة في محادثة ماسنجر");
      window.open("https://m.me/", "_blank", "noopener,noreferrer");
      return;
    }

    if (channelId === "sms") {
      const smsSeparator =
        typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)
          ? "&"
          : "?";
      const smsUrl = `sms:${rawPhone}${smsSeparator}body=${encodedMsg}`;
      window.location.href = smsUrl;
      return;
    }

    if (channelId === "call") {
      if (!rawPhone) {
        warning("رقم هاتف المورد غير مسجل للاتصال المباشر");
        return;
      }
      window.location.href = `tel:${rawPhone}`;
    }
  };

  const handleNativeShareWithImage = async () => {
    if (typeof navigator === "undefined" || !navigator.share) {
      await copyMessageToClipboard(false);
      return;
    }
    try {
      const shareData: ShareData = {
        title: `طلب تزويد: ${productName}`,
        text: finalMessage,
      };

      if (attachImage && resolvedImage) {
        try {
          const response = await fetch(resolvedImage);
          const blob = await response.blob();
          const file = new File([blob], "product.jpg", { type: blob.type || "image/jpeg" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            shareData.files = [file];
          }
        } catch {
          // في حال تعذر تحويل الصورة لملف، يتم الاكتفاء بالرابط المضمن في النص
        }
      }

      await navigator.share(shareData);
    } catch {
      // المستخدم ألغى المشاركة
    }
  };

  const adjustQuantity = (delta: number) => {
    const current = parseInt(quantity, 10) || 0;
    const next = Math.max(1, current + delta);
    setQuantity(String(next));
  };

  const isOutOfStock = currentStock <= 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto animate-fadeIn"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-contact-modal-title"
    >
      {/* حاوية النافذة بالسمة البنفسجية الملكية الداكنة وتصميم متجاوب بالكامل */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg my-auto rounded-3xl overflow-hidden border border-purple-500/40 bg-gradient-to-b from-[#241046] via-[#170b2e] to-[#0f0720] text-white shadow-[0_25px_70px_rgba(91,33,182,0.55)] flex flex-col max-h-[92vh]"
      >
        {/* الشريط العلوي (Header) مع زر الإغلاق البارز (✕) */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-gradient-to-l from-[#5b21b6] via-[#4c1d95] to-[#3b0764] border-b border-purple-400/25 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-xl shrink-0 shadow-inner">
              📨
            </div>
            <div className="min-w-0">
              <h2
                id="supplier-contact-modal-title"
                className="text-base sm:text-lg font-black text-white truncate"
              >
                مراسلة المورد
              </h2>
              <div className="flex items-center gap-2 flex-wrap text-xs text-purple-200 font-semibold">
                <span className="truncate">{supplier.name}</span>
                {rawPhone && (
                  <>
                    <span aria-hidden="true">•</span>
                    <span dir="ltr" className="font-mono text-purple-100">
                      {rawPhone}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة المراسلة"
            title="إغلاق (Esc)"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-red-500/80 text-white border border-white/20 hover:border-red-300 flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer shadow-sm text-base font-black"
          >
            ✕
          </button>
        </div>

        {/* محتوى النافذة القابل للتمرير السلس */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* بطاقة معلومات المنتج وحالة المخزون */}
          <div
            className={`rounded-2xl p-3.5 sm:p-4 border transition-all ${
              isOutOfStock
                ? "bg-red-950/45 border-red-500/50"
                : "bg-amber-950/40 border-amber-500/45"
            }`}
          >
            <div className="flex items-center gap-3.5">
              {resolvedImage ? (
                <img
                  src={resolvedImage}
                  alt={productName}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shrink-0 border-2 shadow-md ${
                    isOutOfStock ? "border-red-400" : "border-amber-400"
                  }`}
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-purple-950/80 border border-purple-500/30 flex items-center justify-center shrink-0 text-2xl">
                  📦
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm leading-none" aria-hidden="true">
                    ⚠️
                  </span>
                  <span
                    className={`text-xs font-extrabold ${
                      isOutOfStock ? "text-red-300" : "text-amber-300"
                    }`}
                  >
                    {isOutOfStock ? "منتج نافد من المخزون تماماً" : "منتج بكمية منخفضة"}
                  </span>
                </div>

                <p className="text-sm sm:text-base font-black text-white leading-snug break-words">
                  {productName}
                </p>

                <div className="flex items-center gap-3 flex-wrap text-xs text-purple-200">
                  <span>
                    الكمية الحالية:{" "}
                    <strong
                      className={`font-black text-sm px-1.5 py-0.5 rounded-md ${
                        isOutOfStock
                          ? "bg-red-500/30 text-red-200"
                          : "bg-amber-500/30 text-amber-200"
                      }`}
                    >
                      {currentStock}
                    </strong>
                  </span>
                  {liveProduct?.barcode && (
                    <span className="text-purple-300 font-mono text-[11px]">
                      باركود: {liveProduct.barcode}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* خيار إرفاق صورة المنتج مع الرسالة (Toggle Switch) */}
          <div
            onClick={() => setAttachImage((prev) => !prev)}
            role="switch"
            aria-checked={attachImage}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setAttachImage((prev) => !prev);
              }
            }}
            className={`w-full rounded-2xl p-3.5 border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
              attachImage
                ? "bg-[#5b21b6]/35 border-purple-400/60 shadow-[0_0_20px_rgba(139,92,246,0.2)]"
                : "bg-white/5 border-white/10 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg transition-colors ${
                  attachImage
                    ? "bg-purple-500 text-white shadow-sm"
                    : "bg-white/10 text-purple-300"
                }`}
              >
                🖼️
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-extrabold text-white break-words">
                  إرفاق صورة المنتج مع الرسالة
                </p>
                <p className="text-[11px] text-purple-200/80 leading-relaxed">
                  {resolvedImage
                    ? attachImage
                      ? "مفعّل — سيتم تضمين صورة/رابط المنتج تلقائياً في الرسالة"
                      : "غير مفعّل — سيتم إرسال النص بدون مرفق الصورة"
                    : "لا توجد صورة مسجلة لهذا المنتج حالياً"}
                </p>
              </div>
            </div>

            {/* مفتاح التبديل البصري */}
            <div
              className={`w-12 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                attachImage && resolvedImage ? "bg-emerald-500" : "bg-gray-600"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                  attachImage && resolvedImage ? "-translate-x-6" : "translate-x-0"
                }`}
              />
            </div>
          </div>

          {/* حقل الكمية المطلوبة مع أزرار الزيادة السريعة */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-extrabold text-purple-100 block">
              الكمية المطلوبة للتزويد
            </label>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full sm:flex-1 px-4 py-2.5 rounded-xl bg-[#120824] border border-purple-500/40 text-white font-black text-base focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-center sm:text-right"
              />
              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
                {[5, 10, 25, 50].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => adjustQuantity(step)}
                    className="flex-1 sm:flex-initial px-2.5 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-700/80 border border-purple-500/30 text-xs font-extrabold text-purple-100 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    +{step}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* حقل الرسالة المخصصة مع المعاينة الفورية */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs sm:text-sm font-extrabold text-purple-100 flex items-center gap-1.5">
                <span aria-hidden="true">✨</span>
                <span>الرسالة (اختياري — تُجهّز تلقائياً)</span>
              </label>
              <div className="flex items-center gap-1.5">
                {customMessage && (
                  <button
                    type="button"
                    onClick={() => setCustomMessage("")}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-bold text-purple-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>↺</span>
                    <span>الافتراضي</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyMessageToClipboard(false)}
                  className="px-2.5 py-1 rounded-lg bg-purple-600/50 hover:bg-purple-600 border border-purple-400/30 text-[11px] font-bold text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{copied ? "✓" : "📋"}</span>
                  <span>{copied ? "تم النسخ" : "نسخ النص"}</span>
                </button>
              </div>
            </div>

            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#120824] border border-purple-500/40 text-white placeholder-purple-300/45 focus:ring-2 focus:ring-purple-400 outline-none resize-none text-xs sm:text-sm leading-relaxed"
              placeholder={finalMessage}
            />
          </div>

          {/* أزرار التحويل المباشر لتطبيقات المراسلة */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs sm:text-sm font-extrabold text-purple-100">
                اختر طريقة التواصل للتحويل الفوري المباشر
              </label>
              <button
                type="button"
                onClick={handleNativeShareWithImage}
                className="text-[11px] font-extrabold text-purple-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                title="مشاركة الرسالة وصورة المنتج عبر تطبيقات الجهاز"
              >
                <span>📤</span>
                <span>مشاركة مع الصورة</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* واتساب مباشر */}
              <button
                type="button"
                onClick={() => handleDirectChannelClick("whatsapp")}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-white font-extrabold text-xs sm:text-sm transition-all active:scale-98 cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs text-base">
                    💬
                  </span>
                  <span className="truncate">واتساب مباشر</span>
                </div>
                <span className="text-emerald-300 text-xs font-bold shrink-0">↗</span>
              </button>

              {/* تليجرام مباشر */}
              <button
                type="button"
                onClick={() => handleDirectChannelClick("telegram")}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-sky-600/25 hover:bg-sky-600/40 border border-sky-500/40 text-white font-extrabold text-xs sm:text-sm transition-all active:scale-98 cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-xs text-base">
                    ✈️
                  </span>
                  <span className="truncate">تليجرام مباشر</span>
                </div>
                <span className="text-sky-300 text-xs font-bold shrink-0">↗</span>
              </button>

              {/* ماسنجر */}
              <button
                type="button"
                onClick={() => handleDirectChannelClick("messenger")}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-blue-600/25 hover:bg-blue-600/40 border border-blue-500/40 text-white font-extrabold text-xs sm:text-sm transition-all active:scale-98 cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs text-base">
                    🔵
                  </span>
                  <span className="truncate">ماسنجر</span>
                </div>
                <span className="text-blue-300 text-xs font-bold shrink-0">↗</span>
              </button>

              {/* رسالة SMS */}
              <button
                type="button"
                onClick={() => handleDirectChannelClick("sms")}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-white font-extrabold text-xs sm:text-sm transition-all active:scale-98 cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-[#5b21b6] text-white flex items-center justify-center shrink-0 shadow-xs text-base">
                    📱
                  </span>
                  <span className="truncate">رسالة SMS</span>
                </div>
                <span className="text-purple-300 text-xs font-bold shrink-0">↗</span>
              </button>

              {/* اتصال هاتفي مباشر */}
              <button
                type="button"
                onClick={() => handleDirectChannelClick("call")}
                className="sm:col-span-2 w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-l from-rose-600/35 to-red-600/35 hover:from-rose-600/55 hover:to-red-600/55 border border-rose-500/45 text-white font-extrabold text-xs sm:text-sm transition-all active:scale-98 cursor-pointer shadow-sm"
              >
                <span className="text-base shrink-0">📞</span>
                <span>اتصال مباشر بالمورد</span>
                {rawPhone && (
                  <span dir="ltr" className="font-mono text-xs text-rose-200">
                    ({rawPhone})
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* شريط التذييل السفلي (Footer) مع زر الإغلاق السريع */}
        <div className="px-4 sm:px-6 py-3 bg-[#120824]/90 border-t border-purple-500/25 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-purple-300/80 truncate">
            انقر خارج النافذة أو زر ✕ للإغلاق السريع
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-extrabold text-white transition-colors cursor-pointer shrink-0"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
}
