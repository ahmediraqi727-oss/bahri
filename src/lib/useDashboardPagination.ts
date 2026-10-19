"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/**
 * خطاف تأخير النص المدخل (Debounce) لمنع تجميد الواجهة أثناء الكتابة السريعة في حقول البحث
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 180): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export interface DashboardPaginationResult<T> {
  /** العناصر المعروضة حالياً ضمن الدفعات المحملة */
  visibleItems: T[];
  /** العدد الحالي للعناصر المعروضة */
  displayLimit: number;
  /** إجمالي العناصر المطابقة للفلتر بالكامل */
  totalFilteredCount: number;
  /** هل يوجد المزيد من الدفعات لتحميلها؟ */
  hasMore: boolean;
  /** هل تم تفعيل مضاعفة الدفعة نتيجة التمرير السريع؟ */
  isFastScrolling: boolean;
  /** حجم الدفعة الأساسي حسب حجم الشاشة (40 للحاسوب / 20 للجوال) */
  baseBatchSize: number;
  /** حجم الدفعة الفعلي الحالي (يتضاعف إلى 80 أو 40 عند التمرير السريع) */
  effectiveBatchSize: number;
  /** مرجع عنصر المراقبة السفلي (IntersectionObserver Sentinel) */
  sentinelRef: (node: HTMLElement | null) => void;
  /** دالة تحميل دفعة إضافية يدوياً عند الحاجة */
  loadMore: () => void;
}

/**
 * خطاف التحميل التدريجي الذكي المخصص لأقسام لوحة التحكم (Adaptive Chunked Pagination)
 * - يحمل 40 عنصراً للشاشات الكبيرة (>= 1024px) و20 عنصراً للهواتف والأجهزة اللوحية.
 * - يراقب سرعة التمرير (Scroll Velocity): عند التمرير السريع يضاعف حجم الدفعة تلقائياً (40 -> 80 و 20 -> 40).
 */
export function useDashboardPagination<T extends { id?: string }>(
  items: T[],
  hydrateImages?: (ids: string[]) => void
): DashboardPaginationResult<T> {
  const [baseBatchSize, setBaseBatchSize] = useState<number>(40);
  const [displayLimit, setDisplayLimit] = useState<number>(40);
  const [isFastScrolling, setIsFastScrolling] = useState<boolean>(false);

  const scrollSpeedRef = useRef<number>(0);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  const fastScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // تحديد حجم الدفعة الابتدائية بناءً على عرض الشاشة (40 سطح مكتب / 20 جوال وتابلت)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateScreenBatch = () => {
      const isLargeScreen = window.innerWidth >= 1024;
      const nextBase = isLargeScreen ? 40 : 20;
      setBaseBatchSize((prev) => {
        if (prev !== nextBase) {
          setDisplayLimit((currentLimit) => Math.max(nextBase, currentLimit));
        }
        return nextBase;
      });
    };

    updateScreenBatch();
    window.addEventListener("resize", updateScreenBatch, { passive: true });
    return () => window.removeEventListener("resize", updateScreenBatch);
  }, []);

  // إعادة ضبط حد العرض عند تغير نتائج البحث أو الفلتر
  useEffect(() => {
    setDisplayLimit(baseBatchSize);
  }, [items.length, baseBatchSize]);

  // مراقبة سرعة التمرير لمضاعفة الدفعة تلقائياً عند النزول السريع
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const now = performance.now();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const dt = now - lastScrollTimeRef.current;

      if (dt > 12 && lastScrollTimeRef.current > 0) {
        const dy = Math.abs(scrollTop - lastScrollTopRef.current);
        const velocity = dy / dt; // px per ms
        scrollSpeedRef.current = velocity;

        if (velocity > 1.5) {
          setIsFastScrolling(true);
          if (fastScrollTimeoutRef.current) clearTimeout(fastScrollTimeoutRef.current);
          fastScrollTimeoutRef.current = setTimeout(() => {
            setIsFastScrolling(false);
            scrollSpeedRef.current = 0;
          }, 900);
        }
      }

      lastScrollTopRef.current = scrollTop;
      lastScrollTimeRef.current = now;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (fastScrollTimeoutRef.current) clearTimeout(fastScrollTimeoutRef.current);
    };
  }, []);

  const effectiveBatchSize = isFastScrolling ? baseBatchSize * 2 : baseBatchSize;
  const hasMore = displayLimit < items.length;

  const loadMore = useCallback(() => {
    setDisplayLimit((prev) => {
      if (prev >= items.length) return prev;
      const increment = scrollSpeedRef.current > 1.5 ? baseBatchSize * 2 : baseBatchSize;
      return Math.min(prev + increment, items.length);
    });
  }, [items.length, baseBatchSize]);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            loadMore();
          }
        },
        { rootMargin: "380px" }
      );
      observerRef.current.observe(node);
    },
    [hasMore, loadMore]
  );

  const visibleItems = useMemo(() => {
    return items.slice(0, displayLimit);
  }, [items, displayLimit]);

  // جلب الصور تدريجياً للعناصر المعروضة فقط (Lazy Image Hydration)
  useEffect(() => {
    if (!hydrateImages || visibleItems.length === 0) return;
    const ids = visibleItems
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length > 0) {
      hydrateImages(ids);
    }
  }, [visibleItems, hydrateImages]);

  return {
    visibleItems,
    displayLimit: Math.min(displayLimit, items.length),
    totalFilteredCount: items.length,
    hasMore,
    isFastScrolling,
    baseBatchSize,
    effectiveBatchSize,
    sentinelRef,
    loadMore,
  };
}
