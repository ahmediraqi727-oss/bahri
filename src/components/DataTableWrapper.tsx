"use client";

import React, { useRef, useState } from "react";
import { useData } from "@/lib/data-context";

export interface DataTableWrapperProps {
  children?: React.ReactNode;
  className?: string;
  /** تفعيل هيكل التحميل يدوياً (إذا لم يُمرر، يرتبط تلقائياً بحالة التحميل الأولية من Supabase) */
  isLoading?: boolean;
  /** تفعيل هيكل التحميل السفلي أثناء جلب الدفعات الإضافية عند التمرير */
  isLoadingMore?: boolean;
  /** عدد عناصر هيكل التحميل الأولي */
  skeletonCount?: number;
  /** عدد عناصر هيكل التحميل الإضافي عند جلب الدفعات */
  batchSkeletonCount?: number;
  /** نمط العرض: تلقائي (بطاقات بالجوال وجدول بالحاسوب) أو بطاقات فقط أو جدول فقط */
  variant?: "auto" | "table" | "cards";
  /** هل يتم التحقق تلقائياً من حالة جلب البيانات في DataContext؟ */
  autoDetectLoading?: boolean;
  /** نص توضيحي اختياري يظهر أعلى هيكل التحميل */
  loadingLabel?: string;
}

/**
 * هيكل بطاقة منتج متطور بوميض بنفسجي ملكي (Royal Purple Shimmer Product Card Skeleton)
 * يحاكي بدقة تفاصيل بطاقة المنتج (العنوان، الحالة، الصورة المصغرة، شبكة الأسعار والمخزون، وأزرار الإجراءات)
 */
export function RoyalProductCardSkeleton({
  count = 4,
  compact = false,
  className = "",
}: {
  count?: number;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`space-y-3.5 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="جاري تحميل بطاقات المنتجات"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`royal-card-skeleton-${idx}`}
          style={{ animationDelay: `${Math.min(idx * 55, 300)}ms` }}
          className="bg-white dark:bg-[#140a2a]/95 rounded-2xl border border-purple-200/80 dark:border-purple-800/50 p-4 shadow-sm space-y-3.5 transition-all animate-fadeIn"
        >
          {/* 1. Header: Checkbox + Product Title + Category & Stock Status */}
          <div className="flex items-center justify-between gap-2 border-b border-purple-100/80 dark:border-purple-900/50 pb-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-5 h-5 rounded-md royal-shimmer-box shrink-0 border border-purple-300/30 dark:border-purple-700/40" />
              <div className="space-y-1.5 flex-1">
                <div
                  className={`h-4 rounded-lg royal-shimmer-box ${
                    idx % 2 === 0 ? "w-3/4" : "w-2/3"
                  }`}
                />
                <div className="h-2.5 w-1/3 rounded-md royal-shimmer-box opacity-75" />
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="h-6 w-16 rounded-lg royal-shimmer-box border border-purple-300/20 dark:border-purple-700/30" />
              <div className="h-6 w-14 rounded-lg royal-shimmer-box border border-purple-300/20 dark:border-purple-700/30" />
            </div>
          </div>

          {/* 2. Featured Image Section (Centered 64x64 Royal Shimmer Box) */}
          <div className="flex items-center justify-center my-1">
            <div className="w-16 h-16 rounded-xl royal-shimmer-box border border-purple-300/40 dark:border-purple-700/50 shadow-inner flex items-center justify-center">
              <div className="w-7 h-7 rounded-lg bg-purple-400/15 dark:bg-purple-300/10" />
            </div>
          </div>

          {/* 3. Body: 2-Column Structured Pricing & Stock Grid */}
          <div className="grid grid-cols-2 gap-2.5 bg-purple-50/50 dark:bg-[#1e103d]/60 p-3 rounded-xl border border-purple-100 dark:border-purple-800/40">
            <div className="space-y-1.5">
              <div className="h-2.5 w-16 rounded royal-shimmer-box opacity-70" />
              <div className="h-4 w-24 rounded-md royal-shimmer-box" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2.5 w-20 rounded royal-shimmer-box opacity-70" />
              <div className="h-4 w-16 rounded-md royal-shimmer-box" />
            </div>
            {!compact && (
              <>
                <div className="space-y-1.5 pt-1">
                  <div className="h-2.5 w-16 rounded royal-shimmer-box opacity-70" />
                  <div className="h-3.5 w-20 rounded-md royal-shimmer-box" />
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="h-2.5 w-16 rounded royal-shimmer-box opacity-70" />
                  <div className="h-3.5 w-20 rounded-md royal-shimmer-box" />
                </div>
              </>
            )}
          </div>

          {/* 4. Footer: Touch Action Buttons */}
          {!compact && (
            <div className="flex items-center gap-2 pt-1 border-t border-purple-100/70 dark:border-purple-900/40">
              <div className="flex-1 h-10 rounded-xl royal-shimmer-box border border-purple-300/20 dark:border-purple-700/30" />
              <div className="flex-1 h-10 rounded-xl royal-shimmer-box border border-purple-300/20 dark:border-purple-700/30" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * هيكل جدول منتجات متطور للحاسوب بوميض بنفسجي ملكي (Desktop Table Skeleton)
 */
export function RoyalProductTableSkeleton({
  rows = 8,
  showHeader = true,
  className = "",
}: {
  rows?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`w-full overflow-hidden ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="جاري تحميل جدول المنتجات"
    >
      <table className="w-full text-xs text-right border-collapse">
        {showHeader && (
          <thead>
            <tr className="border-b border-purple-200/70 dark:border-purple-800/50 bg-purple-50/60 dark:bg-[#1a0d36]">
              <th className="p-2.5 w-9 text-center">
                <div className="w-4 h-4 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2.5 w-[210px]">
                <div className="h-3.5 w-28 rounded royal-shimmer-box" />
              </th>
              <th className="p-2.5 text-center">
                <div className="h-3.5 w-16 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2 text-center">
                <div className="h-3.5 w-14 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2 text-center">
                <div className="h-3.5 w-14 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2 text-center">
                <div className="h-3.5 w-12 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2 text-center">
                <div className="h-3.5 w-16 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2 text-center">
                <div className="h-3.5 w-14 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2 text-center">
                <div className="h-3.5 w-16 mx-auto rounded royal-shimmer-box" />
              </th>
              <th className="p-2 text-center w-24">
                <div className="h-3.5 w-14 mx-auto rounded royal-shimmer-box" />
              </th>
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-purple-100/70 dark:divide-purple-900/35">
          {Array.from({ length: rows }).map((_, idx) => (
            <tr
              key={`royal-row-skeleton-${idx}`}
              style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
              className="bg-white dark:bg-[#110822]/90 animate-fadeIn"
            >
              {/* Checkbox */}
              <td className="p-2.5 text-center w-9">
                <div className="w-4 h-4 mx-auto rounded royal-shimmer-box" />
              </td>

              {/* Product Image + Name & Description */}
              <td className="p-2.5 max-w-[210px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg royal-shimmer-box shrink-0 border border-purple-300/30 dark:border-purple-700/40" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div
                      className={`h-3.5 rounded-md royal-shimmer-box ${
                        idx % 3 === 0 ? "w-36" : idx % 3 === 1 ? "w-28" : "w-32"
                      }`}
                    />
                    <div className="h-2.5 w-20 rounded royal-shimmer-box opacity-70" />
                  </div>
                </div>
              </td>

              {/* Category */}
              <td className="p-2 text-center">
                <div className="h-5 w-20 mx-auto rounded-lg royal-shimmer-box" />
              </td>

              {/* Cost Price */}
              <td className="p-2 text-center">
                <div className="h-4 w-16 mx-auto rounded-md royal-shimmer-box" />
              </td>

              {/* Wholesale Price */}
              <td className="p-2 text-center">
                <div className="h-4 w-16 mx-auto rounded-md royal-shimmer-box" />
              </td>

              {/* Profit % */}
              <td className="p-2 text-center">
                <div className="h-4 w-10 mx-auto rounded-md royal-shimmer-box" />
              </td>

              {/* Retail Price */}
              <td className="p-2 text-center">
                <div className="h-4 w-20 mx-auto rounded-md royal-shimmer-box" />
              </td>

              {/* Stock */}
              <td className="p-2 text-center">
                <div className="h-5 w-12 mx-auto rounded-md royal-shimmer-box" />
              </td>

              {/* Supplier */}
              <td className="p-2 text-center">
                <div className="h-3.5 w-16 mx-auto rounded royal-shimmer-box" />
              </td>

              {/* Actions */}
              <td className="p-2 text-center w-24">
                <div className="flex flex-col items-center justify-center gap-1">
                  <div className="h-5 w-16 rounded-md royal-shimmer-box" />
                  <div className="h-5 w-16 rounded-md royal-shimmer-box" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * هيكل تحميل متجاوب يتكيف تلقائياً بين بطاقات المنتجات في الجوال وصفوف الجدول في الحاسوب
 */
export function ResponsiveProductDataSkeleton({
  desktopRows = 8,
  mobileCards = 4,
  loadingLabel = "جاري جلب بيانات المنتجات من قاعدة البيانات...",
  showBanner = true,
}: {
  desktopRows?: number;
  mobileCards?: number;
  loadingLabel?: string;
  showBanner?: boolean;
}) {
  return (
    <div className="w-full overflow-hidden">
      {showBanner && (
        <div className="px-4 py-2.5 bg-purple-50/80 dark:bg-[#1a0d38]/90 border-b border-purple-200/70 dark:border-purple-800/50 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-[#5b21b6] dark:text-purple-200">
            <span className="w-3.5 h-3.5 border-2 border-[#5b21b6] dark:border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>{loadingLabel}</span>
          </div>
          <span className="text-[11px] font-medium text-purple-600/80 dark:text-purple-300/75 hidden sm:inline">
            مزامنة سحابية فورية
          </span>
        </div>
      )}

      {/* Desktop View: Table Rows Skeleton */}
      <div className="hidden md:block">
        <RoyalProductTableSkeleton rows={desktopRows} showHeader={true} />
      </div>

      {/* Mobile View: Product Cards Skeleton */}
      <div className="block md:hidden p-3">
        <RoyalProductCardSkeleton count={mobileCards} />
      </div>
    </div>
  );
}

export default function DataTableWrapper({
  children,
  className = "",
  isLoading,
  isLoadingMore = false,
  skeletonCount = 8,
  batchSkeletonCount = 3,
  variant = "auto",
  autoDetectLoading = true,
  loadingLabel = "جاري جلب بيانات المنتجات من قاعدة البيانات...",
}: DataTableWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // الربط التلقائي بحالة الجلب من DataContext عند عدم تمرير isLoading صراحةً
  const dataCtx = useData();
  const effectiveIsLoading =
    typeof isLoading === "boolean"
      ? isLoading
      : autoDetectLoading && dataCtx.loading && dataCtx.products.length === 0;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current || effectiveIsLoading) return;
    // Don't initiate drag if clicking on interactive elements like buttons, inputs, links, checkboxes
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a, textarea")) return;

    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Drag speed multiplier
    if (Math.abs(walk) > 4) {
      containerRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  // عرض هيكل التحميل الأولي المتكيف تلقائياً مع الشاشة
  if (effectiveIsLoading) {
    if (variant === "cards") {
      return (
        <div className={`p-3 ${className}`}>
          <RoyalProductCardSkeleton count={Math.min(skeletonCount, 6)} />
        </div>
      );
    }
    if (variant === "table") {
      return (
        <div className={`overflow-x-auto w-full max-w-full ${className}`}>
          <RoyalProductTableSkeleton rows={skeletonCount} showHeader={true} />
        </div>
      );
    }
    return (
      <div className={`w-full max-w-full ${className}`}>
        <ResponsiveProductDataSkeleton
          desktopRows={skeletonCount}
          mobileCards={Math.max(3, Math.ceil(skeletonCount / 2))}
          loadingLabel={loadingLabel}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      style={{ touchAction: "pan-x pan-y" }}
      className={`overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 transition-opacity duration-200 animate-fadeIn ${
        isDragging ? "cursor-grabbing select-none" : "cursor-grab"
      } ${className}`}
    >
      {children}

      {/* هياكل التحميل الإضافية السفلية عند جلب الدفعات أثناء التمرير */}
      {isLoadingMore && (
        <div className="border-t border-purple-200/60 dark:border-purple-800/40">
          {variant === "cards" ? (
            <div className="p-3">
              <RoyalProductCardSkeleton count={batchSkeletonCount} compact={true} />
            </div>
          ) : variant === "table" ? (
            <RoyalProductTableSkeleton rows={batchSkeletonCount} showHeader={false} />
          ) : (
            <>
              <div className="hidden md:block">
                <RoyalProductTableSkeleton rows={batchSkeletonCount} showHeader={false} />
              </div>
              <div className="block md:hidden p-3">
                <RoyalProductCardSkeleton count={Math.min(batchSkeletonCount, 2)} compact={true} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
