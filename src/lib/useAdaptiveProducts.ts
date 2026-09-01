"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import { Product } from "@/lib/types";
import { rowToProduct } from "@/lib/data-context";

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
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
}

/**
 * Calculates initial page batch size dynamically based on Viewport Density:
 * - Mobile (< 768px - grid-cols-2): 10 items (fills screen + buffer)
 * - Tablet (768px - 1024px - md:grid-cols-3): 12 items
 * - Desktop (> 1024px - lg:grid-cols-4 / xl:grid-cols-5): 20 items
 */
function getViewportBatchSize(): number {
  if (typeof window === "undefined") return 12;
  const width = window.innerWidth;
  if (width < 768) return 10;
  if (width <= 1024) return 12;
  return 20;
}

export function useAdaptiveProducts({
  searchQuery = "",
  selectedCategory = null,
  initialProducts = [],
}: UseAdaptiveProductsOptions = {}): UseAdaptiveProductsReturn {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [batchSize, setBatchSize] = useState(getViewportBatchSize());

  const pageRef = useRef(0);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Velocity tracking ref
  const velocityRef = useRef<number>(0);
  const lastScrollYRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(Date.now());

  // Update batch size on window resize
  useEffect(() => {
    const handleResize = () => {
      const newSize = getViewportBatchSize();
      setBatchSize(newSize);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Recommendation 2: Passive scroll listener for velocity tracking with MANDATORY CLEANUP
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const now = Date.now();
      const currentY = window.scrollY;
      const dt = now - lastScrollTimeRef.current;

      if (dt > 30) {
        const dy = Math.abs(currentY - lastScrollYRef.current);
        const velocity = dy / dt; // px per ms
        velocityRef.current = velocity;

        lastScrollYRef.current = currentY;
        lastScrollTimeRef.current = now;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch page logic supporting velocity doubling and AbortController cancellation
  const fetchProductsPage = useCallback(
    async (pageToFetch: number, isReset = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Recommendation 3: Cancel previous stale request via AbortController
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Recommendation 2 / Rule: Adapt batch size according to scroll velocity
        const isHighVelocity = velocityRef.current > 1.2;
        const currentBatchSize = isHighVelocity ? batchSize * 2 : batchSize;

        const from = pageToFetch * currentBatchSize;
        const to = from + currentBatchSize - 1;

        let query = supabase
          .from("products")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to);

        if (selectedCategory && selectedCategory.trim()) {
          query = query.ilike("notes", `%${selectedCategory}%`);
        }

        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.trim();
          query = query.or(`name.ilike.%${q}%,notes.ilike.%${q}%`);
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
          const fetchedItems = data.map((row) => rowToProduct(row as Record<string, unknown>));
          const countVal = count ?? fetchedItems.length;
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

          const currentTotal = isReset ? fetchedItems.length : products.length + fetchedItems.length;
          setHasMore(fetchedItems.length >= currentBatchSize && currentTotal < countVal);
          pageRef.current = pageToFetch;
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
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
    [batchSize, selectedCategory, searchQuery, products.length]
  );

  // Recommendation 5: useCallback for loadMore
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || isFetchingRef.current) return;
    const nextPage = pageRef.current + 1;
    await fetchProductsPage(nextPage, false);
  }, [hasMore, loading, loadingMore, fetchProductsPage]);

  // Recommendation 5: useCallback for refetch
  const refetch = useCallback(async () => {
    pageRef.current = 0;
    await fetchProductsPage(0, true);
  }, [fetchProductsPage]);

  // Trigger refetch whenever category or searchQuery changes
  useEffect(() => {
    pageRef.current = 0;
    fetchProductsPage(0, true);
  }, [selectedCategory, searchQuery]);

  // Recommendation 4: IntersectionObserver with rootMargin: '300px'
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (loading || loadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();

      if (node) {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting && hasMore && !isFetchingRef.current) {
              loadMore();
            }
          },
          { rootMargin: "300px" } // 300px margin before bottom of screen
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
    loadMore,
    refetch,
    sentinelRef,
  };
}
