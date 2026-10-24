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
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
}

// Track whether the `search_products_smart` RPC is installed in Supabase to avoid redundant failed RPC calls
let smartRpcAvailable: boolean | null = null;

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

  // Debounce search query (180ms) to eliminate per-keystroke network bottlenecks
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keep products synced when initialProducts arrive from DataContext
  useEffect(() => {
    if (initialProducts.length > 0 && products.length === 0 && !debouncedSearch.trim()) {
      setProducts(initialProducts);
      setLoading(false);
    }
  }, [initialProducts, products.length, debouncedSearch]);

  const pageRef = useRef(0);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Velocity tracking ref
  const velocityRef = useRef<number>(0);
  const lastScrollYRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(Date.now());

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

      if (dt > 30) {
        const dy = Math.abs(currentY - lastScrollYRef.current);
        velocityRef.current = dy / dt;
        lastScrollYRef.current = currentY;
        lastScrollTimeRef.current = now;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const fetchProductsPage = useCallback(
    async (pageToFetch: number, isReset = false) => {
      // Allow reset queries to cancel in-flight requests instead of being dropped
      if (isFetchingRef.current && !isReset) return;
      isFetchingRef.current = true;

      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const isHighVelocity = velocityRef.current > 1.2;
        const currentBatchSize = isHighVelocity ? batchSize * 2 : batchSize;

        const from = pageToFetch * currentBatchSize;
        const to = from + currentBatchSize - 1;
        const cleanQuery = normalizeDigits(debouncedSearch.trim());

        // 1. Try Supabase Smart Trigram RPC when searching (if installed in SQL Editor)
        if (cleanQuery && smartRpcAvailable !== false && (!selectedCategory || selectedCategory === "الكل")) {
          const { data: rpcData, error: rpcError } = await supabase.rpc("search_products_smart", {
            search_term: cleanQuery,
            result_limit: currentBatchSize,
            result_offset: from,
          });

          if (controller.signal.aborted) return;

          if (!rpcError && Array.isArray(rpcData)) {
            smartRpcAvailable = true;
            const fetchedItems = rpcData.map((row) => rowToProduct(row as Record<string, unknown>));
            setTotalCount(fetchedItems.length);
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
            pageRef.current = pageToFetch;
            return;
          } else if (rpcError) {
            // RPC not yet created in Supabase; fall back silently to multi-token query
            smartRpcAvailable = false;
          }
        }

        // 2. Standard / Multi-Token Partial & Synonym Supabase Query
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
          const cat = selectedCategory.trim();
          query = query.or(
            `notes.ilike.%${cat}%,notes.ilike.%جميع الاقسام%,notes.ilike.%جميع الأقسام%`
          );
        }

        if (cleanQuery) {
          // Build smart OR clauses for tokens + primary synonyms so partial/out-of-order queries match
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
    [batchSize, selectedCategory, debouncedSearch, products.length]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || isFetchingRef.current) return;
    const nextPage = pageRef.current + 1;
    await fetchProductsPage(nextPage, false);
  }, [hasMore, loading, loadingMore, fetchProductsPage]);

  const refetch = useCallback(async () => {
    pageRef.current = 0;
    await fetchProductsPage(0, true);
  }, [fetchProductsPage]);

  useEffect(() => {
    pageRef.current = 0;
    fetchProductsPage(0, true);
  }, [selectedCategory, debouncedSearch]);

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
          { rootMargin: "300px" }
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
