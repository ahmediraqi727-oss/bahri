'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Product } from '@/lib/types';
import { useData } from '@/lib/data-context';
import ProgressiveProductImage from '@/components/ProgressiveProductImage';
import { RoyalProductCardSkeleton } from '@/components/DataTableWrapper';

// إعدادات الأداء والدفعات الافتراضية
const DEFAULT_INITIAL_LIMIT = 10;
const DEFAULT_BATCH_SIZE = 10;

export interface OptimizedProductListProps {
  /** قائمة المنتجات الكاملة */
  products?: (Product | any)[];
  /** حالة التحميل الاختيارية (ترتبط تلقائياً بـ DataContext عند عدم التمرير) */
  isLoading?: boolean;
  /** مرجع اختياري لعنوان حاوية التمرير في حال استخدام المكون داخل Modal أو بطاقة ثابته الارتفاع */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** دالة مخصصة لتقديم كل منتج حسب رغبة الشاشة المستدعية */
  renderProduct?: (product: any, index: number) => React.ReactNode;
  /** رسالة المظهر الفارغ عند البحث أو الفلترة */
  emptyMessage?: string;
  /** عدد العناصر الأولية عند البداية */
  initialLimit?: number;
  /** عدد عناصر الدفعة العادية */
  batchSize?: number;
  /** فئات CSS إضافية للحاوية الخارجية */
  className?: string;
  /** حدث عند النقر على المنتج */
  onProductClick?: (product: any) => void;
}

export default function OptimizedProductList({
  products = [],
  isLoading,
  containerRef,
  renderProduct,
  emptyMessage = 'لا توجد منتجات مطابقة حالياً',
  initialLimit = DEFAULT_INITIAL_LIMIT,
  batchSize = DEFAULT_BATCH_SIZE,
  className = '',
  onProductClick,
}: OptimizedProductListProps) {
  const { loading: dataLoading } = useData();
  const effectiveLoading = typeof isLoading === 'boolean' ? isLoading : dataLoading && products.length === 0;

  const [displayCount, setDisplayCount] = useState<number>(initialLimit);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  
  const lastScrollTop = useRef<number>(0);
  const lastScrollTime = useRef<number>(Date.now());
  const rafId = useRef<number | null>(null);

  // إعادة ضبط العداد عند تغيير الفلاتر أو قائمة المنتجات لتجنب الخلل في الأداء
  useEffect(() => {
    setDisplayCount(initialLimit);
  }, [products.length, initialLimit]);

  // استشعار التمرير وحساب السرعة (Velocity Detection & Container Adaptability)
  const checkAndLoadMore = useCallback(() => {
    let scrollTop = 0;
    let scrollHeight = 0;
    let clientHeight = 0;

    const containerEl = containerRef?.current;

    if (containerEl) {
      // تمرير الحاوية المغلقة (Fixed Modal / Scrollable Container)
      scrollTop = containerEl.scrollTop;
      scrollHeight = containerEl.scrollHeight;
      clientHeight = containerEl.clientHeight;
    } else if (typeof window !== 'undefined') {
      // تمرير نافذة المتصفح الرئيسية (Window Scroll)
      scrollTop = window.scrollY || document.documentElement.scrollTop;
      scrollHeight = document.documentElement.scrollHeight;
      clientHeight = window.innerHeight;
    } else {
      return;
    }

    const now = Date.now();
    const timeDelta = now - lastScrollTime.current;
    const scrollDelta = Math.abs(scrollTop - lastScrollTop.current);

    // حساب سرعة التمرير (بكسل / ملي ثانية)
    const scrollVelocity = timeDelta > 0 ? scrollDelta / timeDelta : 0;

    lastScrollTop.current = scrollTop;
    lastScrollTime.current = now;

    // المسافة المتبقية للوصول للقاع
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

    // التحميل عندما يقترب المستخدم من القاع (أقل من 300 بكسل) ويوجد عناصر متبقية
    if (distanceToBottom <= 300 && displayCount < products.length && !isLoadingMore) {
      setIsLoadingMore(true);

      // الاستجابة للسرعة: بالتمرير السريع نضاعف الدفعة 3 مرات لمنع الفراغات
      const dynamicBatch = scrollVelocity > 1.5 ? batchSize * 3 : batchSize;

      setTimeout(() => {
        setDisplayCount((prev) => Math.min(prev + dynamicBatch, products.length));
        setIsLoadingMore(false);
      }, 120);
    }
  }, [containerRef, displayCount, products.length, isLoadingMore, batchSize]);

  // معالج التمرير المحمي بـ requestAnimationFrame لمنع Layout Thrashing
  const handleScroll = useCallback(() => {
    if (rafId.current !== null) return;

    rafId.current = requestAnimationFrame(() => {
      checkAndLoadMore();
      rafId.current = null;
    });
  }, [checkAndLoadMore]);

  // ربط أحداث التمرير سواء بالحاوية أو بالنافذة
  useEffect(() => {
    const targetElement = containerRef?.current;

    if (targetElement) {
      targetElement.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        targetElement.removeEventListener('scroll', handleScroll);
        if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      };
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', handleScroll);
        if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      };
    }
  }, [containerRef, handleScroll]);

  // تقطيع القائمة لعرض الدفعة الحالية فقط في الـ DOM
  const visibleProducts = useMemo(() => {
    return products.slice(0, displayCount);
  }, [products, displayCount]);

  // 0. التعامل مع حالة التحميل الأولي من قاعدة البيانات
  if (effectiveLoading) {
    return (
      <div className={className}>
        <RoyalProductCardSkeleton count={4} compact={true} />
      </div>
    );
  }

  // 1. التعامل مع الحالة الفارغة (products.length === 0)
  if (products.length === 0) {
    return (
      <div className={`p-8 bg-[#1e1936]/80 border border-purple-500/20 backdrop-blur-md rounded-2xl text-center shadow-lg transition-all animate-fadeIn ${className}`}>
        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 text-2xl">
          🔍
        </div>
        <h3 className="text-base font-semibold text-white mb-1">لا توجد نتائج</h3>
        <p className="text-xs text-purple-300/80 max-w-xs mx-auto">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 animate-fadeIn ${className}`}>
      {/* مؤشر وشريط عدد المنتجات المعروضة */}
      <div className="text-xs text-purple-300/90 px-2 flex justify-between items-center bg-[#1e1936]/50 p-2.5 rounded-xl border border-purple-500/20 backdrop-blur-sm">
        <span className="flex items-center gap-1.5">
          عرض <strong className="text-white font-bold">{visibleProducts.length}</strong> من أصل <strong className="text-white font-bold">{products.length}</strong> منتج
        </span>
        {isLoadingMore && (
          <span className="animate-pulse text-purple-400 font-medium flex items-center gap-1">
            ⚡ جاري تحميل الدفعة التالية...
          </span>
        )}
      </div>

      {/* قائمة المنتجات المحسنة */}
      <div className="space-y-3">
        {visibleProducts.map((product, index) => {
          if (renderProduct) {
            return (
              <div key={product.id || `prod-${index}`}>
                {renderProduct(product, index)}
              </div>
            );
          }

          // العرض الافتراضي الأنيق للمنتج
          const productName = product.name || product.title || 'منتج بدون اسم';
          const productPrice = product.retailPrice ?? product.price;
          const barcode = product.barcode;

          return (
            <div
              key={product.id || `prod-default-${index}`}
              onClick={() => onProductClick?.(product)}
              className={`p-4 bg-[#1e1936]/80 hover:bg-[#251f42] border border-purple-500/30 hover:border-purple-400/50 rounded-xl flex items-center justify-between text-white shadow-md hover:shadow-purple-500/10 transition-all duration-200 ${
                onProductClick ? 'cursor-pointer' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <ProgressiveProductImage
                  src={product.image}
                  thumbnailSrc={product.thumbnailUrl}
                  blurDataUrl={product.blurDataUrl}
                  productId={product.id}
                  alt={productName}
                  mode="thumbnail"
                  isHydrating={product.imageChecked === false && !product.image && !product.thumbnailUrl}
                  containerClassName="w-10 h-10 rounded-lg border border-purple-500/20 shrink-0"
                  fallbackTextClassName="text-xs"
                />
                <div>
                  <h4 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                    {productName}
                  </h4>
                  {barcode && (
                    <span className="text-[10px] font-mono text-purple-300/70 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/20">
                      {barcode}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-left">
                {productPrice !== undefined && (
                  <span className="text-xs font-semibold text-purple-200 bg-purple-900/40 px-2.5 py-1 rounded-lg border border-purple-500/30">
                    {Number(productPrice).toLocaleString('ar-IQ')} د.ع
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. هياكل التحميل البنفسجية الملكية للدفعات الإضافية */}
      {isLoadingMore && (
        <div className="space-y-3 pt-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="p-4 bg-[#1e1936]/55 border border-purple-500/25 rounded-xl flex items-center justify-between animate-fadeIn"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-10 h-10 rounded-lg royal-shimmer-box border border-purple-500/30" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 royal-shimmer-box rounded w-1/3" />
                  <div className="h-2.5 royal-shimmer-box rounded w-1/5 opacity-75" />
                </div>
              </div>
              <div className="w-16 h-6 royal-shimmer-box rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* مؤشر اسحب للأسفل التنازلي */}
      {displayCount < products.length && !isLoadingMore && (
        <div className="py-4 text-center text-xs text-purple-300/60 animate-pulse flex items-center justify-center gap-1">
          <span>↓</span> اسحب للأسفل لعرض المزيد من المنتجات...
        </div>
      )}
    </div>
  );
}
