"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { getCachedProductThumbnail } from "@/lib/image-optimizer";

export interface ProgressiveProductImageProps {
  /** رابط الصورة الرئيسية للمنتج */
  src?: string | null;
  /** رابط الصورة المصغرة المربعة (200x200) إن وجد */
  thumbnailSrc?: string | null;
  /** نسخة التمويه الفورية (24x24 Data URL) إن وجدت */
  blurDataUrl?: string | null;
  /** معرّف المنتج لاسترجاع المصغرة من الذاكرة المحلية تلقائياً */
  productId?: string | null;
  /** النص البديل للصورة */
  alt?: string;
  /** وضع العرض: مصغرة للجداول والقوائم أو بطاقة متجر كاملة */
  mode?: "thumbnail" | "card" | "detail";
  /** تحميل فوري بدون انتظار التمرير (لأول عناصر الشاشة) */
  priority?: boolean;
  /** يشير إلى أن حقل الصورة قيد الجلب من قاعدة البيانات (يمنع ظهور رمز الصندوق المؤقت) */
  isHydrating?: boolean;
  /** فئات CSS للحاوية الخارجية */
  containerClassName?: string;
  /** فئات CSS للصورة نفسها */
  imgClassName?: string;
  /** أيقونة بديلة عند عدم توفر صورة */
  fallbackIcon?: React.ReactNode;
  /** حجم الأيقونة البديلة */
  fallbackTextClassName?: string;
}

/**
 * مكون عرض الصور الذكي المتكيف مع ضعف الإنترنت:
 * - يعرض خلفية متدرجة باللون البنفسجي الملكي (#5b21b6 -> #2e1065) مع معاينة ضبابية فورية (Blur-Up).
 * - يستخدم المصغرات المربعة الخفيفة (200x200 WebP) في الجداول والقوائم والماسح الضوئي لسرعة فائقة.
 * - ينتقل تدريجياً بسلاسة (Smooth Crossfade) فور اكتمال تحميل الصورة بدون أي اهتزاز في التخطيط.
 */
export default function ProgressiveProductImage({
  src,
  thumbnailSrc,
  blurDataUrl,
  productId,
  alt = "",
  mode = "thumbnail",
  priority = false,
  isHydrating = false,
  containerClassName = "w-10 h-10 rounded-xl",
  imgClassName = "object-cover",
  fallbackIcon = "📦",
  fallbackTextClassName = "text-base",
}: ProgressiveProductImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [useFallbackSrc, setUseFallbackSrc] = useState<boolean>(false);

  // استرجاع المصغرة أو المعاينة الضبابية المخزنة محلياً إذا لم تُمرر مباشرة
  const cached = useMemo(
    () => getCachedProductThumbnail(productId, src),
    [productId, src]
  );

  const effectiveThumb = thumbnailSrc || cached?.thumbnail || null;
  const effectiveBlur = blurDataUrl || cached?.blur || null;

  // في وضع الجداول والقوائم (thumbnail) نعطي الأولوية للمصغرة المربعة 200x200 لأنها أخف بـ 90%
  const primaryTargetSrc = useMemo(() => {
    const cleanSrc = (src || "").trim();
    const cleanThumb = (effectiveThumb || "").trim();
    if (mode === "thumbnail") {
      return cleanThumb || cleanSrc;
    }
    return cleanSrc || cleanThumb;
  }, [src, effectiveThumb, mode]);

  const secondaryTargetSrc = useMemo(() => {
    const cleanSrc = (src || "").trim();
    const cleanThumb = (effectiveThumb || "").trim();
    if (mode === "thumbnail") {
      return cleanSrc && cleanSrc !== cleanThumb ? cleanSrc : "";
    }
    return cleanThumb && cleanThumb !== cleanSrc ? cleanThumb : "";
  }, [src, effectiveThumb, mode]);

  const targetSrc = useFallbackSrc && secondaryTargetSrc ? secondaryTargetSrc : primaryTargetSrc;

  // الصورة الاستباقية للتمويه الفوري خلف الصورة أثناء التحميل
  const previewBackdropSrc = useMemo(() => {
    if (effectiveBlur) return effectiveBlur;
    if (mode !== "thumbnail" && effectiveThumb && effectiveThumb !== targetSrc) {
      return effectiveThumb;
    }
    return null;
  }, [effectiveBlur, effectiveThumb, mode, targetSrc]);

  useEffect(() => {
    setHasError(false);
    setUseFallbackSrc(false);
    if (primaryTargetSrc && primaryTargetSrc.startsWith("data:image/")) {
      setLoaded(true);
    } else if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    } else {
      setLoaded(false);
    }
  }, [primaryTargetSrc]);

  // أثناء جلب حقل الصورة في الخلفية نعرض تدرجاً بنفسجياً أنيقاً بدون إظهار الصندوق الكرتوني المؤقت
  if (!targetSrc && isHydrating && !hasError) {
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden select-none bg-gradient-to-br from-[#2e1065] via-[#4c1d95] to-[#5b21b6] animate-pulse ${containerClassName}`}
        aria-hidden="true"
      />
    );
  }

  // الاكتفاء بالرمز البديل (📦) فقط للمنتجات التي لا تملك صورة أصلاً أو فشل رابطها
  if (!targetSrc || hasError) {
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden flex items-center justify-center select-none bg-gradient-to-br from-[#2e1065]/15 via-[#4c1d95]/10 to-[#5b21b6]/20 dark:from-[#2e1065]/60 dark:via-[#1e1136] dark:to-[#5b21b6]/40 text-purple-500 dark:text-purple-300/80 ${containerClassName}`}
        aria-hidden="true"
      >
        <span className={fallbackTextClassName}>{fallbackIcon}</span>
      </div>
    );
  }

  const isEager = priority || mode === "card" || mode === "detail";

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden select-none bg-gradient-to-br from-[#2e1065] via-[#4c1d95] to-[#5b21b6] ${containerClassName}`}
    >
      {/* خلفية متدرجة بنفسجية ملكية خفيفة خلف الصورة مباشرة بدون حجب ظهورها */}
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 pointer-events-none"
        >
          {previewBackdropSrc ? (
            <img
              src={previewBackdropSrc}
              alt=""
              className="w-full h-full object-cover scale-105 blur-sm opacity-90"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#5b21b6]/70 via-[#4c1d95]/80 to-[#2e1065]" />
          )}
        </div>
      )}

      {/* عرض الصورة الفعلية فوراً عند أول ظهور للبطاقة بدون إخفاء (opacity-100 مباشرة) */}
      <img
        ref={imgRef}
        src={targetSrc}
        alt={alt}
        loading={isEager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!useFallbackSrc && secondaryTargetSrc) {
            setUseFallbackSrc(true);
          } else {
            setHasError(true);
          }
        }}
        className={`relative z-10 w-full h-full opacity-100 ${imgClassName}`}
      />
    </div>
  );
}
