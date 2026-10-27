"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import { Product } from "@/lib/types";
import { rowToProduct } from "@/lib/data-context";
import { normalizeDigits, expandTokenSynonyms } from "@/lib/smart-search";

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
  hasMore: boolean;
  totalCount: number;
  batchSize: number;
  isFastScrolling: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
}

// Track RPC availability and column support to avoid redundant failed probes
let storefrontRpcAvailable: boolean | null = null;
let extendedColsSupported: boolean | null = null;

const STOREFRONT_EXTENDED_COLS =
  "id, name, image, thumbnail_url, cost_price, wholesale_price, retail_price, profit_margin, stock, batch_stock, supplier_id, notes, category_id, category_name, is_all_categories, barcode, qr_code, sku, created_at, updated_at";

const STOREFRONT_CORE_COLS =
  "id, name, image, cost_price, wholesale_price, retail_price, profit_margin, stock, supplier_id, notes, category_id, barcode, qr_code, created_at, updated_at";

/**
 * تحديد حجم الدفعة المتجاوب حسب حجم الشاشة:
 * - الجوال والأجهزة اللوحية (< 1024px): 20 منتجاً في كل دفعة
 * - الحواسيب والشاشات الكبيرة (>= 1024px): 40 منتجاً في كل دفعة
 */
export function getViewportBatchSize(): number {
  if (typeof window === "undefined") return 20;
  return window.innerWidth < 1024 ? 20 : 40;
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
  const initialWithImages = initialProducts.filter((p) => Boolean(p.image && p.image.trim()));
  const [products, setProducts] = useState<Product[]>(
    initialWithImages.slice(0, getViewportBatchSize())
  );
  const [loading, setLoading] = useState<boolean>(initialWithImages.length === 0);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [batchSize, setBatchSize] = useState<number>(getViewportBatchSize());
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
    async (isReset = false) => {
      if (isFetchingRef.current && !isReset) return;
      isFetchingRef.current = true;
      const reqId = ++requestIdRef.current;

      if (isReset) {
        setLoading(true);
        offsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }

      try {
        const baseBatch = getViewportBatchSize();
        // مضاعفة حجم الدفعة تلقائياً عند التمرير السريع (20 تصبح 40 للجوال، و40 تصبح 80 للحاسوب)
        const isHighVelocity = !isReset && velocityRef.current > 1.15;
        const currentBatchSize = isHighVelocity ? baseBatch * 2 : baseBatch;

        const from = isReset ? 0 : offsetRef.current;
        const cleanQuery = normalizeDigits((debouncedSearch || "").trim());
        const cleanCategory =
          selectedCategory &&
          selectedCategory.trim() !== "" &&
          selectedCategory.trim() !== "الكل"
            ? selectedCategory.trim()
            : null;

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
            const hasMoreFlag = rpcData.length > currentBatchSize;
            const slicedRows = rpcData.slice(0, currentBatchSize);
            const fetchedItems = slicedRows.map((row) => {
              const p = rowToProduct(row as Record<string, unknown>);
              p.imageChecked = true;
              return p;
            });

            offsetRef.current = from + fetchedItems.length;
            setTotalCount((prev) =>
              isReset ? offsetRef.current : Math.max(prev, offsetRef.current)
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
            setHasMore(hasMoreFlag);
            return;
          } else if (rpcError) {
            storefrontRpcAvailable = false;
          }
        }

        // 2. Fallback: Parallel 20-row chunked slices without `count: "exact"` or `original_image_url`
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
        const hasMoreFlag = combinedRows.length > currentBatchSize;
        const slicedRows = combinedRows.slice(0, currentBatchSize);

        const fetchedItems = slicedRows.map((row) => {
          const p = rowToProduct(row);
          p.imageChecked = true;
          return p;
        });

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

        setHasMore(hasMoreFlag && fetchedItems.length > 0);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Adaptive storefront fetch error:", err);
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          isFetchingRef.current = false;
        }
      }
    },
    [selectedCategory, debouncedSearch, canSeeOutOfStock, executeRangeSlice]
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

