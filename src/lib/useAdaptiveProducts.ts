"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import { Product } from "@/lib/types";
import { rowToProduct } from "@/lib/data-context";
import { normalizeDigits, expandTokenSynonyms } from "@/lib/smart-search";

export interface ViewportGridMetrics {
  deviceType: "mobile" | "tablet" | "desktop";
  width: number;
  height: number;
  columns: number;
  visibleRows: number;
  /** عدد المنتجات المعروضة فوراً في الشاشة الأولى (Above the Fold) بأولوية قصوى */
  initialFoldCount: number;
  /** حجم الدفعة اللاحقة عند الجلب المسبق بالخلفية أو التمرير */
  scrollBatchSize: number;
}

interface UseAdaptiveProductsOptions {
  searchQuery?: string;
  selectedCategory?: string | null;
  canSeeOutOfStock?: boolean;
  initialProducts?: Product[];
}

interface UseAdaptiveProductsReturn {
  products: Product[];
  loading: boolean;
  loadingMore: boolean;
  isPrefetching: boolean;
  hasMore: boolean;
  totalCount: number;
  /** عدد منتجات الشاشة الأولى المحسوب ديناميكياً (مثلاً 4 للجوال، 10 للتابلت، 16 للحاسوب) */
  initialFoldCount: number;
  /** حجم الدفعة التكيفية للتمرير */
  batchSize: number;
  viewportMetrics: ViewportGridMetrics;
  isFastScrolling: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
}

// Track RPC availability and column support to avoid redundant failed probes
let storefrontRpcAvailable: boolean | null = null;
let extendedColsSupported: boolean | null = null;

// Global set of pre-decoded image URLs so we never decode the same URL twice
const decodedImageCache = new Set<string>();

/**
 * تحميل وفك ترميز الصورة مسبقاً في الخلفية (Async Image Pre-decoding)
 * لضمان رسمها في 0ms فور ظهور البطاقة أثناء التمرير
 */
export function preloadAndDecodeImage(url?: string | null): void {
  if (typeof window === "undefined" || !url) return;
  const cleanUrl = url.trim();
  if (!cleanUrl || cleanUrl.startsWith("data:") || decodedImageCache.has(cleanUrl)) {
    return;
  }
  decodedImageCache.add(cleanUrl);

  const img = new window.Image();
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = cleanUrl;
  if (typeof img.decode === "function") {
    img.decode().catch(() => {
      // Ignore decode rejections for cross-origin or cached images
    });
  }
}

const STOREFRONT_EXTENDED_COLS =
  "id, name, image, thumbnail_url, cost_price, wholesale_price, retail_price, profit_margin, stock, batch_stock, supplier_id, notes, category_id, category_name, is_all_categories, barcode, qr_code, sku, created_at, updated_at";

const STOREFRONT_CORE_COLS =
  "id, name, image, cost_price, wholesale_price, retail_price, profit_margin, stock, supplier_id, notes, category_id, barcode, qr_code, created_at, updated_at";

/**
 * حساب هندسة الشبكة وعدد المنتجات المرئية ديناميكياً بالكامل بناءً على عرض وارتفاع النافذة:
 * - الهواتف المحمولة (< 640px): أول 4 منتجات للشاشة الأولى (Above the fold) لسرعة استجابة فورية، ثم دفعات من 8 منتجات بالخلفية.
 * - الأجهزة اللوحية (640px - 1023px): حساب عدد الأعمدة (2 أو 3) × الصفوف المرئية حسب الارتفاع (مثلاً 8 - 10 منتجات للشاشة الأولى).
 * - الحواسيب (>= 1024px): 4 أعمدة × الصفوف المرئية حسب ارتفاع الشاشة (مثلاً 12 - 20 منتجاً تملأ الشاشة الأولى بالكامل).
 */
export function calculateViewportGridMetrics(
  width?: number,
  height?: number
): ViewportGridMetrics {
  const w =
    typeof width === "number"
      ? width
      : typeof window !== "undefined"
      ? window.innerWidth
      : 390;
  const h =
    typeof height === "number"
      ? height
      : typeof window !== "undefined"
      ? window.innerHeight
      : 844;

  // 1. Mobile Phones (< 640px)
  if (w < 640) {
    const columns = 1;
    const estimatedCardHeight = 310;
    const rawVisibleRows = Math.max(2, Math.ceil(h / estimatedCardHeight) + 1);
    // ضمان تحميل أول 4 منتجات فوراً في الهواتف المحمولة (أو 5 للشاشات الطويلة جداً)
    const initialFoldCount = Math.min(Math.max(4, rawVisibleRows), 4);
    return {
      deviceType: "mobile",
      width: w,
      height: h,
      columns,
      visibleRows: initialFoldCount,
      initialFoldCount: 4,
      scrollBatchSize: 8,
    };
  }

  // 2. Tablets (640px - 1023px)
  if (w < 1024) {
    const columns = w >= 768 ? 3 : 2;
    const estimatedRowHeight = 340;
    const visibleRows = Math.max(3, Math.ceil(h / estimatedRowHeight) + 2);
    // حساب العدد الدقيق للشاشة الأولى على التابلت (10 منتجات قياسياً أو مضاعف للأعمدة حسب الارتفاع)
    const computedCount = columns * visibleRows;
    const initialFoldCount = w < 768 ? Math.max(8, Math.min(computedCount, 12)) : Math.max(10, Math.min(computedCount, 15));
    return {
      deviceType: "tablet",
      width: w,
      height: h,
      columns,
      visibleRows,
      initialFoldCount: w >= 768 ? 10 : Math.max(8, Math.min(10, computedCount)),
      scrollBatchSize: columns * 4,
    };
  }

  // 3. Desktops & Large Screens (>= 1024px)
  const columns = 4;
  const estimatedRowHeight = 360;
  const visibleRows = Math.max(3, Math.ceil(h / estimatedRowHeight) + 1);
  const initialFoldCount = Math.min(Math.max(12, columns * visibleRows), 24);
  return {
    deviceType: "desktop",
    width: w,
    height: h,
    columns,
    visibleRows,
    initialFoldCount,
    scrollBatchSize: Math.max(16, columns * 5),
  };
}

/**
 * دالة متوافقة للإرجاع السريع لحجم دفعة التمرير حسب الشاشة
 */
export function getViewportBatchSize(): number {
  return calculateViewportGridMetrics().scrollBatchSize;
}

/**
 * خطاف (Hook) استشعار أبعاد الشاشة وتحديث حسابات الشبكة لحظياً
 */
export function useViewportGridConfig(): ViewportGridMetrics {
  const [metrics, setMetrics] = useState<ViewportGridMetrics>(() =>
    calculateViewportGridMetrics()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId: number | null = null;
    const updateMetrics = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const next = calculateViewportGridMetrics(window.innerWidth, window.innerHeight);
        setMetrics((prev) => {
          if (
            prev.deviceType === next.deviceType &&
            prev.columns === next.columns &&
            prev.initialFoldCount === next.initialFoldCount &&
            prev.scrollBatchSize === next.scrollBatchSize
          ) {
            return prev;
          }
          return next;
        });
      });
    };

    updateMetrics();
    window.addEventListener("resize", updateMetrics, { passive: true });
    window.addEventListener("orientationchange", updateMetrics, { passive: true });
    return () => {
      window.removeEventListener("resize", updateMetrics);
      window.removeEventListener("orientationchange", updateMetrics);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return metrics;
}

/**
 * توليد بدائل الحروف العربية الشائعة (ه/ة، ا/أ/إ) لضمان تطابق اسم القسم في استعلامات قاعدة البيانات المباشرة
 */
function buildCategoryVariants(cat: string): string[] {
  const clean = cat.replace(/[,%()]/g, "").trim();
  if (!clean) return [];
  const set = new Set<string>([clean]);
  set.add(clean.replace(/ه(?=\s|$)/g, "ة"));
  set.add(clean.replace(/ة/g, "ه"));
  set.add(clean.replace(/[أإآ]/g, "ا"));
  return Array.from(set).filter(Boolean).slice(0, 4);
}

export function useAdaptiveProducts({
  searchQuery = "",
  selectedCategory = null,
  canSeeOutOfStock = true,
  initialProducts = [],
}: UseAdaptiveProductsOptions = {}): UseAdaptiveProductsReturn {
  const viewportMetrics = useViewportGridConfig();
  const initialWithImages = initialProducts.filter((p) => Boolean(p.image && p.image.trim()));

  const [products, setProducts] = useState<Product[]>(() =>
    initialWithImages.slice(0, calculateViewportGridMetrics().initialFoldCount)
  );
  const [loading, setLoading] = useState<boolean>(initialWithImages.length === 0);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [isPrefetching, setIsPrefetching] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isFastScrolling, setIsFastScrolling] = useState<boolean>(false);

  // Debounce search query (150ms) when user types; instant (0ms) when search is cleared
  const [debouncedSearch, setDebouncedSearch] = useState<string>(() => (searchQuery || "").trim());
  useEffect(() => {
    const trimmed = (searchQuery || "").trim();
    if (!trimmed) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const offsetRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const requestIdRef = useRef<number>(0);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll velocity tracking (px/ms)
  const velocityRef = useRef<number>(0);
  const lastScrollYRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(Date.now());
  const fastScrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const now = Date.now();
      const currentY = window.scrollY;
      const dt = now - lastScrollTimeRef.current;

      if (dt > 25) {
        const dy = Math.abs(currentY - lastScrollYRef.current);
        const instantVelocity = dy / dt; // px per ms
        velocityRef.current = velocityRef.current * 0.35 + instantVelocity * 0.65;
        lastScrollYRef.current = currentY;
        lastScrollTimeRef.current = now;

        if (velocityRef.current > 1.15) {
          setIsFastScrolling(true);
          if (fastScrollResetTimerRef.current) {
            clearTimeout(fastScrollResetTimerRef.current);
          }
          fastScrollResetTimerRef.current = setTimeout(() => {
            velocityRef.current = 0;
            setIsFastScrolling(false);
          }, 900);
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (fastScrollResetTimerRef.current) {
        clearTimeout(fastScrollResetTimerRef.current);
      }
      if (warmupTimerRef.current) {
        clearTimeout(warmupTimerRef.current);
      }
    };
  }, []);

  const executeRangeSlice = useCallback(
    async (
      sliceFrom: number,
      sliceTo: number,
      cleanCategory: string | null,
      cleanQuery: string,
      includeOutOfStock: boolean
    ): Promise<Record<string, unknown>[]> => {
      const buildQuery = (cols: string, useExtendedCategoryCols: boolean) => {
        let q = supabase
          .from("products")
          .select(cols)
          .order("created_at", { ascending: false })
          .range(sliceFrom, sliceTo);

        if (!includeOutOfStock) {
          q = q.gt("stock", 0);
        }

        if (cleanCategory) {
          const variants = buildCategoryVariants(cleanCategory);
          const catClauses: string[] = [
            "notes.ilike.%جميع الاقسام%",
            "notes.ilike.%جميع الأقسام%",
          ];
          if (useExtendedCategoryCols) {
            catClauses.push("is_all_categories.eq.true");
          }
          variants.forEach((v) => {
            catClauses.push(`notes.ilike.%${v}%`);
            if (useExtendedCategoryCols) {
              catClauses.push(`category_name.ilike.%${v}%`);
            }
          });
          q = q.or(catClauses.join(","));
        }

        if (cleanQuery) {
          const tokens = cleanQuery
            .split(/\s+/)
            .map((t) => t.replace(/[,%()]/g, "").trim())
            .filter(Boolean)
            .slice(0, 4);

          const orClauses: string[] = [];
          const cleanWhole = cleanQuery.replace(/[,%()]/g, "").trim();
          if (cleanWhole) {
            orClauses.push(`name.ilike.%${cleanWhole}%`);
            orClauses.push(`notes.ilike.%${cleanWhole}%`);
            orClauses.push(`barcode.ilike.%${cleanWhole}%`);
          }

          tokens.forEach((token) => {
            if (token.length >= 2) {
              orClauses.push(`name.ilike.%${token}%`);
              orClauses.push(`notes.ilike.%${token}%`);
              const syns = expandTokenSynonyms(token).slice(0, 3);
              syns.forEach((syn) => {
                const safeSyn = syn.replace(/[,%()]/g, "").trim();
                if (safeSyn.length >= 2) {
                  orClauses.push(`name.ilike.%${safeSyn}%`);
                }
              });
            }
          });

          const uniqueClauses = Array.from(new Set(orClauses)).slice(0, 12);
          if (uniqueClauses.length > 0) {
            q = q.or(uniqueClauses.join(","));
          }
        }

        return q;
      };

      if (extendedColsSupported !== false) {
        const { data, error } = await buildQuery(STOREFRONT_EXTENDED_COLS, true);
        if (!error && data) {
          extendedColsSupported = true;
          return data as unknown as Record<string, unknown>[];
        }
        extendedColsSupported = false;
      }

      const { data: fallbackData, error: fallbackError } = await buildQuery(
        STOREFRONT_CORE_COLS,
        false
      );
      if (fallbackError) {
        console.warn("Supabase storefront slice warning:", fallbackError.message);
        return [];
      }
      return (fallbackData as unknown as Record<string, unknown>[]) || [];
    },
    []
  );

  const fetchProductsBatch = useCallback(
    async (isReset = false, isSilentBackgroundWarmup = false) => {
      if (isFetchingRef.current && !isReset) return;
      isFetchingRef.current = true;
      const reqId = ++requestIdRef.current;

      if (isReset) {
        if (warmupTimerRef.current) {
          clearTimeout(warmupTimerRef.current);
          warmupTimerRef.current = null;
        }
        setLoading(true);
        setIsPrefetching(false);
        offsetRef.current = 0;
      } else if (isSilentBackgroundWarmup) {
        setIsPrefetching(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const metrics = calculateViewportGridMetrics();
        const isHighVelocity = !isReset && velocityRef.current > 1.15;

        // Stage 1 (isReset = true): جلب عدد منتجات الشاشة الأولى فقط (مثلاً 4 للجوال، 10 للتابلت، 16 للحاسوب) لظهور فوري
        // Stage 2+ (isReset = false): جلب دفعة التمرير أو مضاعفتها عند التمرير السريع
        const currentBatchSize = isReset
          ? metrics.initialFoldCount
          : isHighVelocity
          ? metrics.scrollBatchSize * 2
          : metrics.scrollBatchSize;

        const from = isReset ? 0 : offsetRef.current;
        const cleanQuery = normalizeDigits((debouncedSearch || "").trim());
        const cleanCategory =
          selectedCategory &&
          selectedCategory.trim() !== "" &&
          selectedCategory.trim() !== "الكل"
            ? selectedCategory.trim()
            : null;

        let fetchedItems: Product[] = [];
        let hasMoreFlag = false;

        // 1. Primary: High-Speed Supabase RPC `get_storefront_products` (with limit + 1 lookahead)
        if (storefrontRpcAvailable !== false) {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            "get_storefront_products",
            {
              p_limit: currentBatchSize + 1,
              p_offset: from,
              p_category: cleanCategory,
              p_search_query: cleanQuery || null,
              p_include_out_of_stock: canSeeOutOfStock,
            }
          );

          if (reqId !== requestIdRef.current) return;

          if (!rpcError && Array.isArray(rpcData)) {
            storefrontRpcAvailable = true;
            hasMoreFlag = rpcData.length > currentBatchSize;
            const slicedRows = rpcData.slice(0, currentBatchSize);
            fetchedItems = slicedRows.map((row) => {
              const p = rowToProduct(row as Record<string, unknown>);
              p.imageChecked = true;
              return p;
            });
          } else if (rpcError) {
            storefrontRpcAvailable = false;
          }
        }

        // 2. Fallback: Parallel chunked slices if RPC was not yet deployed
        if (storefrontRpcAvailable === false) {
          const SLICES_PER_REQ = 20;
          const totalToFetch = currentBatchSize + 1;
          const slicePromises: Promise<Record<string, unknown>[]>[] = [];

          let cursor = from;
          let remaining = totalToFetch;
          while (remaining > 0) {
            const take = Math.min(remaining, SLICES_PER_REQ + 1);
            slicePromises.push(
              executeRangeSlice(
                cursor,
                cursor + take - 1,
                cleanCategory,
                cleanQuery,
                canSeeOutOfStock
              )
            );
            cursor += take;
            remaining -= take;
          }

          const sliceResults = await Promise.all(slicePromises);
          if (reqId !== requestIdRef.current) return;

          const combinedRows = sliceResults.flat();
          hasMoreFlag = combinedRows.length > currentBatchSize;
          const slicedRows = combinedRows.slice(0, currentBatchSize);

          fetchedItems = slicedRows.map((row) => {
            const p = rowToProduct(row);
            p.imageChecked = true;
            return p;
          });
        }

        // فك ترميز الصور مسبقاً في الخلفية للدفعات الاستباقية لضمان ظهورها في 0ms عند التمرير
        if (!isReset) {
          fetchedItems.forEach((item) => {
            preloadAndDecodeImage(item.image || item.thumbnailUrl);
          });
        }

        const nextOffset = from + fetchedItems.length;
        offsetRef.current = nextOffset;
        setTotalCount((prev) => (isReset ? nextOffset : Math.max(prev, nextOffset)));

        if (isReset) {
          setProducts(fetchedItems);
        } else {
          setProducts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newItems = fetchedItems.filter((p) => !existingIds.has(p.id));
            return [...prev, ...newItems];
          });
        }

        const moreAvailable = hasMoreFlag && fetchedItems.length > 0;
        setHasMore(moreAvailable);

        // الجلب الاستباقي الفوري للدفعة الثانية بالخلفية فور ظهور منتجات الشاشة الأولى
        if (isReset && moreAvailable) {
          warmupTimerRef.current = setTimeout(() => {
            if (reqId === requestIdRef.current && !isFetchingRef.current) {
              fetchProductsBatch(false, true);
            }
          }, 90);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Adaptive storefront fetch error:", err);
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setIsPrefetching(false);
          isFetchingRef.current = false;
        }
      }
    },
    [selectedCategory, debouncedSearch, canSeeOutOfStock, executeRangeSlice]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || isFetchingRef.current) return;
    await fetchProductsBatch(false, false);
  }, [hasMore, loading, loadingMore, fetchProductsBatch]);

  const refetch = useCallback(async () => {
    offsetRef.current = 0;
    await fetchProductsBatch(true, false);
  }, [fetchProductsBatch]);

  useEffect(() => {
    offsetRef.current = 0;
    fetchProductsBatch(true, false);
  }, [selectedCategory, debouncedSearch, canSeeOutOfStock, fetchProductsBatch]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (loading || loadingMore) return;

      if (node) {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting && hasMore && !isFetchingRef.current) {
              loadMore();
            }
          },
          { rootMargin: "750px 0px" }
        );
        observerRef.current.observe(node);
      }
    },
    [loading, loadingMore, hasMore, loadMore]
  );

  return {
    products,
    loading,
    loadingMore,
    isPrefetching,
    hasMore,
    totalCount,
    initialFoldCount: viewportMetrics.initialFoldCount,
    batchSize: viewportMetrics.scrollBatchSize,
    viewportMetrics,
    isFastScrolling,
    loadMore,
    refetch,
    sentinelRef,
  };
}

