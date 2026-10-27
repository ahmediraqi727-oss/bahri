"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import { Product } from "@/lib/types";
import { rowToProduct } from "@/lib/data-context";
import { normalizeDigits, expandTokenSynonyms } from "@/lib/smart-search";

interface UseAdaptiveProductsOptions {
  searchQuery?: string;
  selectedCategory?: string | null;
  initialProducts?: Product[];
}

interface UseAdaptiveProductsReturn {
  products: Product[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  batchSize: number;
  isFastScrolling: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
}

// Track whether the `search_products_smart` RPC is installed in Supabase to avoid redundant failed RPC calls
let smartRpcAvailable: boolean | null = null;

/**
 * تحديد حجم الدفعة المتجاوب حسب حجم الشاشة:
 * - الجوال والأجهزة اللوحية (< 1024px): 20 منتجاً في كل دفعة
 * - الحواسيب والشاشات الكبيرة (>= 1024px): 40 منتجاً في كل دفعة
 */
export function getViewportBatchSize(): number {
  if (typeof window === "undefined") return 20;
  const width = window.innerWidth;
  if (width < 1024) return 20;
  return 40;
}

export function useAdaptiveProducts({
  searchQuery = "",
  selectedCategory = null,
  initialProducts = [],
}: UseAdaptiveProductsOptions = {}): UseAdaptiveProductsReturn {
  // لا نعتمد على المنتجات المبدئية إذا كانت بدون صور لضمان جلب الدفعات مع صورها كاملة
  const initialWithImages = initialProducts.filter((p) => Boolean(p.image && p.image.trim()));
  const [products, setProducts] = useState<Product[]>(
    initialWithImages.slice(0, getViewportBatchSize())
  );
  const [loading, setLoading] = useState(initialWithImages.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [batchSize, setBatchSize] = useState(getViewportBatchSize());
  const [isFastScrolling, setIsFastScrolling] = useState(false);

  // Debounce search query (180ms) to eliminate per-keystroke network bottlenecks
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Accurate offset ref so dynamic batch doubling (20->40 or 40->80) never skips or duplicates rows
  const offsetRef = useRef(0);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll velocity tracking (px/ms)
  const velocityRef = useRef<number>(0);
  const lastScrollYRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(Date.now());
  const fastScrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setBatchSize(getViewportBatchSize());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const now = Date.now();
      const currentY = window.scrollY;
      const dt = now - lastScrollTimeRef.current;

      if (dt > 25) {
        const dy = Math.abs(currentY - lastScrollYRef.current);
        const instantVelocity = dy / dt; // px per ms
        // Smooth exponential moving average so brief pauses don't immediately drop velocity before IntersectionObserver triggers
        velocityRef.current = velocityRef.current * 0.35 + instantVelocity * 0.65;
        lastScrollYRef.current = currentY;
        lastScrollTimeRef.current = now;

        const fast = velocityRef.current > 1.15;
        if (fast) {
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
    };
  }, []);

  const fetchProductsBatch = useCallback(
    async (isReset = false) => {
      // Allow reset queries to cancel in-flight requests instead of being dropped
      if (isFetchingRef.current && !isReset) return;
      isFetchingRef.current = true;

      if (isReset) {
        setLoading(true);
        offsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const baseBatch = getViewportBatchSize();
        // مضاعفة حجم الدفعة تلقائياً عند التمرير السريع (20 تصبح 40 للجوال، و40 تصبح 80 للحاسوب)
        const isHighVelocity = !isReset && velocityRef.current > 1.15;
        const currentBatchSize = isHighVelocity ? baseBatch * 2 : baseBatch;

        const from = isReset ? 0 : offsetRef.current;
        const to = from + currentBatchSize - 1;
        const cleanQuery = normalizeDigits(debouncedSearch.trim());

        // 1. Try Supabase Smart Trigram RPC when searching (if installed in SQL Editor)
        if (
          cleanQuery &&
          smartRpcAvailable !== false &&
          (!selectedCategory || selectedCategory === "الكل")
        ) {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            "search_products_smart",
            {
              search_term: cleanQuery,
              result_limit: currentBatchSize,
              result_offset: from,
            }
          );

          if (controller.signal.aborted) return;

          if (!rpcError && Array.isArray(rpcData)) {
            smartRpcAvailable = true;
            const fetchedItems = rpcData.map((row) =>
              rowToProduct(row as Record<string, unknown>)
            );
            offsetRef.current = from + fetchedItems.length;
            setTotalCount((prev) =>
              isReset ? fetchedItems.length : Math.max(prev, offsetRef.current)
            );
            if (isReset) {
              setProducts(fetchedItems);
            } else {
              setProducts((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                const newItems = fetchedItems.filter((p) => !existingIds.has(p.id));
                return [...prev, ...newItems];
              });
            }
            setHasMore(fetchedItems.length >= currentBatchSize);
            return;
          } else if (rpcError) {
            smartRpcAvailable = false;
          }
        }

        // 2. Direct Chunked Query Fetching Full Product & Image Columns (`image`, `original_image_url`, `thumbnail_url`)
        let query = supabase
          .from("products")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to);

        if (
          selectedCategory &&
          selectedCategory.trim() &&
          selectedCategory.trim() !== "الكل"
        ) {
          const cat = selectedCategory.trim().replace(/[,%()]/g, "");
          query = query.or(
            `notes.ilike.%${cat}%,notes.ilike.%جميع الاقسام%,notes.ilike.%جميع الأقسام%`
          );
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

          const uniqueClauses = Array.from(new Set(orClauses)).slice(0, 14);
          if (uniqueClauses.length > 0) {
            query = query.or(uniqueClauses.join(","));
          }
        }

        const { data, count, error } = await query;

        if (controller.signal.aborted) {
          return;
        }

        if (error) {
          console.warn("Supabase range query error:", error.message);
          setHasMore(false);
          return;
        }

        if (data) {
          const fetchedItems = data.map((row) =>
            rowToProduct(row as Record<string, unknown>)
          );
          const nextOffset = from + fetchedItems.length;
          offsetRef.current = nextOffset;

          const countVal = count ?? nextOffset;
          setTotalCount(countVal);

          if (isReset) {
            setProducts(fetchedItems);
          } else {
            setProducts((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const newItems = fetchedItems.filter((p) => !existingIds.has(p.id));
              return [...prev, ...newItems];
            });
          }

          setHasMore(fetchedItems.length >= currentBatchSize && nextOffset < countVal);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Adaptive streaming fetch error:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
          isFetchingRef.current = false;
        }
      }
    },
    [selectedCategory, debouncedSearch]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || isFetchingRef.current) return;
    await fetchProductsBatch(false);
  }, [hasMore, loading, loadingMore, fetchProductsBatch]);

  const refetch = useCallback(async () => {
    offsetRef.current = 0;
    await fetchProductsBatch(true);
  }, [fetchProductsBatch]);

  useEffect(() => {
    offsetRef.current = 0;
    fetchProductsBatch(true);
  }, [selectedCategory, debouncedSearch, fetchProductsBatch]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (loading || loadingMore) return;

      if (node) {
        // استباق التحميل قبل وصول المستخدم لنهاية القائمة بـ 600px لضمان انسيابية التمرير
        observerRef.current = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting && hasMore && !isFetchingRef.current) {
              loadMore();
            }
          },
          { rootMargin: "600px 0px" }
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
    hasMore,
    totalCount,
    batchSize,
    isFastScrolling,
    loadMore,
    refetch,
    sentinelRef,
  };
}

